// Command loadtest opens N real WebSocket clients against a running server,
// pairs them up two per room, and plays each pair through a full match using
// the same bot decision logic the server itself uses for its computer
// opponent (internal/game.DecideBotAction) — so "the load test finds
// something" tests real command handling, not just that a socket stays open.
//
// It reports matches/sec, p50/p95/p99 command latency (time from sending an
// action to seeing its effect), and this process's own memory footprint as an
// approximation of RSS.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
	"runtime"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"game-server/internal/game"
	"game-server/internal/types"

	"github.com/gorilla/websocket"
)

var msgCounter int64

func nextMessageID() string {
	return fmt.Sprintf("lt-%d", atomic.AddInt64(&msgCounter, 1))
}

func baseMsg(msgType string) types.BaseMessage {
	return types.BaseMessage{MessageID: nextMessageID(), Timestamp: time.Now().UnixMilli(), Type: msgType}
}

// wireMessage is one decoded server->client message, kept as raw JSON until
// the caller knows which concrete type to unmarshal it into.
type wireMessage struct {
	Type string
	Raw  []byte
}

type wsClient struct {
	conn   *websocket.Conn
	userID string
	events chan wireMessage
}

func dial(url string) (*wsClient, error) {
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return nil, err
	}
	c := &wsClient{conn: conn, events: make(chan wireMessage, 64)}
	go func() {
		defer close(c.events)
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var base types.BaseMessage
			if err := json.Unmarshal(data, &base); err != nil {
				continue
			}
			c.events <- wireMessage{Type: base.Type, Raw: data}
		}
	}()

	init, err := c.waitFor(15*time.Second, "user_init")
	if err != nil {
		return nil, fmt.Errorf("waiting for user_init: %w", err)
	}
	var initMsg types.UserInitMessage
	if err := json.Unmarshal(init.Raw, &initMsg); err != nil {
		return nil, err
	}
	c.userID = initMsg.User.ID
	return c, nil
}

func (c *wsClient) send(v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return c.conn.WriteMessage(websocket.TextMessage, data)
}

func (c *wsClient) close() {
	c.conn.Close()
}

// waitFor blocks for the next message of one of the given types, discarding
// anything else (a lobby_state broadcast, say) in between.
func (c *wsClient) waitFor(timeout time.Duration, wantTypes ...string) (wireMessage, error) {
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	for {
		select {
		case msg, ok := <-c.events:
			if !ok {
				return wireMessage{}, fmt.Errorf("connection closed")
			}
			for _, t := range wantTypes {
				if msg.Type == t {
					return msg, nil
				}
			}
		case <-deadline.C:
			return wireMessage{}, fmt.Errorf("timed out waiting for %v", wantTypes)
		}
	}
}

// matchStats accumulates one match's command latencies. Both players in a
// match share one instance, guarded by mu.
type matchStats struct {
	mu        sync.Mutex
	latencies []time.Duration
}

func (s *matchStats) record(d time.Duration) {
	s.mu.Lock()
	s.latencies = append(s.latencies, d)
	s.mu.Unlock()
}

// playSide drives one client through positioning and then, on its own turns,
// through the same decision logic the server's bot uses. It signals doneCh
// (once, across both sides of the match) when it sees the game end.
func playSide(c *wsClient, stats *matchStats, doneOnce *sync.Once, doneCh chan struct{}) {
	positioned := false
	var pendingSince time.Time

	settle := func() {
		if !pendingSince.IsZero() {
			stats.record(time.Since(pendingSince))
			pendingSince = time.Time{}
		}
	}

	for msg := range c.events {
		switch msg.Type {
		case "action_rejected":
			// Just record the round trip and wait for the next real
			// game_state to decide again from fresh, authoritative state.
			// Retrying blindly here risks a tight reject/retry loop that
			// floods the server instead of moving the match forward.
			settle()

		case "game_state":
			var gs types.GameStateMessage
			if err := json.Unmarshal(msg.Raw, &gs); err != nil {
				continue
			}
			settle()
			state := gs.State

			if state.GameStatus == types.StatusGameOver {
				doneOnce.Do(func() { close(doneCh) })
				return
			}

			me, ok := state.Players[c.userID]
			if !ok {
				continue
			}

			if state.GameStatus == types.StatusPositionCharacters && !positioned {
				positioned = true
				var pos types.Position
				if len(me.Character.InitialPositions) > 0 {
					pos = me.Character.InitialPositions[0]
				}
				pendingSince = time.Now()
				_ = c.send(types.CharacterPositionedIn{BaseMessage: baseMsg("character_positioned"), Position: pos})
				continue
			}

			if state.GameStatus == types.StatusPlaying && me.IsCurrentTurn {
				action := game.DecideBotAction(state, c.userID)
				pendingSince = time.Now()
				switch action.Kind {
				case game.BotCast:
					_ = c.send(types.CastSpellIn{BaseMessage: baseMsg("cast_spell"), SpellID: action.SpellID, TargetPosition: action.Target})
				case game.BotMove:
					_ = c.send(types.MoveIn{BaseMessage: baseMsg("move"), Position: action.Target})
				default:
					_ = c.send(types.EndTurnIn{BaseMessage: baseMsg("end_turn")})
				}
			}
		}
	}
}

type matchResult struct {
	finished  bool
	err       error
	latencies []time.Duration
}

// runMatch drives one full match end to end: create a room, join it, create
// both characters, play until game over (or timeout), then report.
func runMatch(url string, index int, timeout time.Duration) matchResult {
	a, err := dial(url)
	if err != nil {
		return matchResult{err: fmt.Errorf("dial player A: %w", err)}
	}
	defer a.close()
	b, err := dial(url)
	if err != nil {
		return matchResult{err: fmt.Errorf("dial player B: %w", err)}
	}
	defer b.close()

	if err := a.send(types.CreateRoomIn{BaseMessage: baseMsg("create_room"), Name: fmt.Sprintf("load%d", index)}); err != nil {
		return matchResult{err: fmt.Errorf("create_room: %w", err)}
	}
	joined, err := a.waitFor(15*time.Second, "room_joined")
	if err != nil {
		return matchResult{err: fmt.Errorf("waiting for room_joined: %w", err)}
	}
	var rj types.RoomJoined
	if err := json.Unmarshal(joined.Raw, &rj); err != nil {
		return matchResult{err: err}
	}

	if err := b.send(types.JoinRoomIn{BaseMessage: baseMsg("join_room"), RoomID: rj.RoomID}); err != nil {
		return matchResult{err: fmt.Errorf("join_room: %w", err)}
	}
	if _, err := b.waitFor(15*time.Second, "room_joined"); err != nil {
		return matchResult{err: fmt.Errorf("waiting for room_joined (B): %w", err)}
	}

	appearance := func(name string) types.CharacterAppearance {
		return types.CharacterAppearance{Name: name, Color: "#c0392b", Symbol: "L"}
	}
	if err := a.send(types.CreateCharacterIn{BaseMessage: baseMsg("create_character"), Character: appearance(fmt.Sprintf("LoadA%d", index))}); err != nil {
		return matchResult{err: fmt.Errorf("create_character (A): %w", err)}
	}
	if err := b.send(types.CreateCharacterIn{BaseMessage: baseMsg("create_character"), Character: appearance(fmt.Sprintf("LoadB%d", index))}); err != nil {
		return matchResult{err: fmt.Errorf("create_character (B): %w", err)}
	}

	stats := &matchStats{}
	doneCh := make(chan struct{})
	var once sync.Once
	go playSide(a, stats, &once, doneCh)
	go playSide(b, stats, &once, doneCh)

	select {
	case <-doneCh:
		return matchResult{finished: true, latencies: stats.latencies}
	case <-time.After(timeout):
		return matchResult{err: fmt.Errorf("match %d timed out after %s", index, timeout), latencies: stats.latencies}
	}
}

func main() {
	url := flag.String("url", "ws://localhost:8080/ws", "server WebSocket URL")
	clients := flag.Int("clients", 500, "number of simulated clients (paired two per match)")
	timeout := flag.Duration("timeout", 60*time.Second, "per-match timeout")
	flag.Parse()

	rooms := *clients / 2
	if rooms < 1 {
		fmt.Fprintln(os.Stderr, "need at least 2 clients")
		os.Exit(1)
	}

	results := make(chan matchResult, rooms)
	var wg sync.WaitGroup
	start := time.Now()
	for i := 0; i < rooms; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			// Real players do not all click "play" in the same millisecond.
			// Spreading the dials out at a fixed rate (~250/s), rather than
			// packing them into a fixed window regardless of count, avoids a
			// self-inflicted thundering herd on connect that would measure
			// this harness's own burst rather than steady-state throughput.
			time.Sleep(time.Duration(i) * 4 * time.Millisecond)
			results <- runMatch(*url, i, *timeout)
		}(i)
	}
	wg.Wait()
	close(results)
	elapsed := time.Since(start)

	var latencies []time.Duration
	finished, failed := 0, 0
	for r := range results {
		if r.finished {
			finished++
		} else {
			failed++
			fmt.Fprintf(os.Stderr, "match failed: %v\n", r.err)
		}
		latencies = append(latencies, r.latencies...)
	}

	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
	percentile := func(p float64) time.Duration {
		if len(latencies) == 0 {
			return 0
		}
		idx := int(math.Ceil(p*float64(len(latencies)))) - 1
		if idx < 0 {
			idx = 0
		}
		if idx >= len(latencies) {
			idx = len(latencies) - 1
		}
		return latencies[idx]
	}

	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	fmt.Printf("rooms: %d, finished: %d, failed: %d, wall time: %s (%.2f matches/sec)\n",
		rooms, finished, failed, elapsed, float64(finished)/elapsed.Seconds())
	fmt.Printf("command latency (n=%d): p50=%s p95=%s p99=%s\n",
		len(latencies), percentile(0.50), percentile(0.95), percentile(0.99))
	fmt.Printf("process memory (Sys, an in-process approximation of RSS — see README): %.1f MiB\n",
		float64(mem.Sys)/1024/1024)

	if failed > 0 {
		os.Exit(1)
	}
}
