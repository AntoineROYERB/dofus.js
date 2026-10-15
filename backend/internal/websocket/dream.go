package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"game-server/internal/dream"
	"game-server/internal/game"
	"game-server/internal/store"
	"game-server/internal/types"
)

// Endless Dreams on the hub's side: parties made and joined over the socket,
// floors opened as private rooms, and what a finished fight does to the run.
// Every change happens on the hub's goroutine like everything else; timers
// only post a run's id back to it.

var (
	ErrAlreadyDreaming = errors.New("you are already in a dream")
	ErrNoSuchParty     = errors.New("there is no party with that code")
	ErrNotDreaming     = errors.New("you are not in a dream")
	ErrRunGone         = errors.New("that dream has ended")
)

// afterFightDelay is how long the party is left looking at the board once a
// fight is over, before it is taken back to the dream: long enough to see
// the last blow land.
const afterFightDelay = 3 * time.Second

// overRunLinger is how long a finished run is kept for its members to read
// how it ended.
const overRunLinger = 10 * time.Minute

// DreamStateMessage is a run as one member sees it. Run is nil once they have
// left it.
type DreamStateMessage struct {
	Type string      `json:"type"`
	Run  *dream.View `json:"run"`
}

// dreams is the hub's state for Endless Dreams. Only the hub goroutine
// touches it.
type dreams struct {
	runs   map[string]*dream.Run
	timers map[string]*time.Timer
	// leaving are the fight rooms whose party is being taken back out.
	leaving map[string]bool
	store   store.DreamStore
	writes  chan runWrite
}

type runWrite struct {
	id    string
	state json.RawMessage
	entry *store.DreamEntry
}

func newDreams(s store.DreamStore) *dreams {
	d := &dreams{
		runs:    make(map[string]*dream.Run),
		timers:  make(map[string]*time.Timer),
		leaving: make(map[string]bool),
		store:   s,
		writes:  make(chan runWrite, 64),
	}
	go d.writer()
	return d
}

// writer saves runs one after the other, so a later state is never
// overwritten by an earlier one that happened to finish last.
func (d *dreams) writer() {
	for w := range d.writes {
		if d.store == nil {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := d.store.SaveRun(ctx, w.id, w.state); err != nil {
			slog.Error("failed to save run", "component", "dream", "run_id", w.id, "error", err)
		}
		if w.entry != nil {
			if err := d.store.SaveDreamEntry(ctx, *w.entry); err != nil {
				slog.Error("failed to save leaderboard entry", "component", "dream", "run_id", w.id, "error", err)
			}
		}
		cancel()
	}
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

// sendDream tells one client where their run stands.
func (h *Hub) sendDream(c *Client, run *dream.Run) {
	msg := DreamStateMessage{Type: "dream_state"}
	if run != nil {
		v := run.ViewFor(c.ID, h.isConnected)
		msg.Run = &v
	}
	if payload, err := json.Marshal(msg); err == nil {
		c.TrySend(payload)
	}
}

// broadcastDream tells every member connected where the run stands, and
// saves it.
func (h *Hub) broadcastDream(run *dream.Run) {
	members := make(map[string]bool, len(run.Members))
	for _, m := range run.Members {
		if !m.Left {
			members[m.UserID] = true
		}
	}
	h.mutex.Lock()
	var clients []*Client
	for client := range h.Clients {
		if members[client.ID] {
			clients = append(clients, client)
		}
	}
	h.mutex.Unlock()
	for _, c := range clients {
		h.sendDream(c, run)
	}
	h.saveRun(run)
}

func (h *Hub) saveRun(run *dream.Run) {
	state, err := json.Marshal(run)
	if err != nil {
		slog.Error("failed to marshal run", "component", "dream", "run_id", run.ID, "error", err)
		return
	}
	w := runWrite{id: run.ID, state: state}
	if run.Over() && run.StartSize > 0 && run.Cleared > 0 {
		w.entry = entryOf(run)
	}
	select {
	case h.dreams.writes <- w:
	default:
		slog.Warn("dropped a run save, the writer is backed up", "component", "dream", "run_id", run.ID)
	}
}

// entryOf is a finished run's line on the leaderboard: the party it set out
// with, whoever walked out on the way.
func entryOf(run *dream.Run) *store.DreamEntry {
	e := &store.DreamEntry{
		RunID: run.ID, Size: run.StartSize, Floor: run.Cleared, Turns: run.Turns,
		MatchIDs: append([]string{}, run.MatchIDs...), EndedAt: run.EndedAt,
		Names: []string{}, Grimoires: []string{},
	}
	for _, m := range run.Members {
		e.Names = append(e.Names, m.Look.Name)
		e.Grimoires = append(e.Grimoires, m.Look.Loadout.Grimoire)
	}
	return e
}

// ---------------------------------------------------------------------------
// Finding a run
// ---------------------------------------------------------------------------

// runOf is the run a client's session belongs to, if it still exists.
func (h *Hub) runOf(c *Client) (*dream.Run, bool) {
	if c.Session.RunID == "" {
		return nil, false
	}
	run, ok := h.dreams.runs[c.Session.RunID]
	return run, ok
}

func (h *Hub) inRun(c *Client, action, messageID string) (*dream.Run, bool) {
	run, ok := h.runOf(c)
	if !ok {
		h.reject(c, action, messageID, ErrNotDreaming)
		return nil, false
	}
	return run, true
}

func newCode() (string, error) {
	id, err := randomHex(4)
	return strings.ToUpper(id), err
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

func handleDreamCreate(h *Hub, c *Client, data []byte) {
	var in types.DreamCreateIn
	if !decode(c, "dream_create", data, &in) {
		return
	}
	if c.RoomID != "" {
		h.reject(c, "dream_create", in.MessageID, game.ErrAlreadyInRoom)
		return
	}
	if run, ok := h.runOf(c); ok && !run.Over() {
		h.reject(c, "dream_create", in.MessageID, ErrAlreadyDreaming)
		return
	}
	if err := game.ValidAppearance(in.Character); err != nil {
		h.reject(c, "dream_create", in.MessageID, err)
		return
	}
	code, err := newCode()
	key, err2 := randomHex(16)
	if err != nil || err2 != nil {
		h.reject(c, "dream_create", in.MessageID, errors.New("could not open a party, try again"))
		return
	}
	for _, taken := h.dreams.runs[code]; taken; _, taken = h.dreams.runs[code] {
		code, _ = newCode()
	}
	in.Character.Loadout = mustKit(in.Character.Loadout)
	run := dream.New(code, game.NewSeed(), dream.Member{Key: key, UserID: c.ID, Look: in.Character})
	h.dreams.runs[code] = run
	c.Session.RunID = code
	slog.Info("dream party opened", "component", "dream", "run_id", code, "user_id", c.ID)
	h.broadcastDream(run)
}

// mustKit writes a loadout down resolved, so an empty one is the set it
// stands for rather than something to work out again on every floor.
func mustKit(l types.Loadout) types.Loadout {
	if kit, err := game.Content().Kit(l); err == nil {
		return kit.Loadout
	}
	return l
}

func handleDreamJoin(h *Hub, c *Client, data []byte) {
	var in types.DreamJoinIn
	if !decode(c, "dream_join", data, &in) {
		return
	}
	if c.RoomID != "" {
		h.reject(c, "dream_join", in.MessageID, game.ErrAlreadyInRoom)
		return
	}
	if run, ok := h.runOf(c); ok && !run.Over() {
		h.reject(c, "dream_join", in.MessageID, ErrAlreadyDreaming)
		return
	}
	run, ok := h.dreams.runs[strings.ToUpper(strings.TrimSpace(in.Code))]
	if !ok || run.Over() {
		h.reject(c, "dream_join", in.MessageID, ErrNoSuchParty)
		return
	}
	if err := game.ValidAppearance(in.Character); err != nil {
		h.reject(c, "dream_join", in.MessageID, err)
		return
	}
	key, err := randomHex(16)
	if err != nil {
		h.reject(c, "dream_join", in.MessageID, errors.New("could not join, try again"))
		return
	}
	in.Character.Loadout = mustKit(in.Character.Loadout)
	if err := run.Join(dream.Member{Key: key, UserID: c.ID, Look: in.Character}); err != nil {
		h.reject(c, "dream_join", in.MessageID, err)
		return
	}
	c.Session.RunID = run.ID
	slog.Info("dream party joined", "component", "dream", "run_id", run.ID, "user_id", c.ID)
	h.broadcastDream(run)
}

// handleDreamResume takes a member back into their run with their key: after
// a reload on a server that has forgotten their session, or after the server
// slept. A run the server no longer holds is read back from the store; a
// fight it was in the middle of is lost with the server, and the party picks
// the floor up again from its choice of rooms.
func handleDreamResume(h *Hub, c *Client, data []byte) {
	var in types.DreamResumeIn
	if !decode(c, "dream_resume", data, &in) {
		return
	}
	run, ok := h.dreams.runs[in.RunID]
	if !ok && h.dreams.store != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		state, err := h.dreams.store.GetRun(ctx, in.RunID)
		cancel()
		if err == nil {
			var loaded dream.Run
			if json.Unmarshal(state, &loaded) == nil {
				run, ok = &loaded, true
				if run.Phase == dream.PhaseFighting {
					run.Phase = dream.PhaseRoom
					run.Chosen = -1
				}
				h.dreams.runs[run.ID] = run
				h.armRun(run)
			}
		}
	}
	if !ok {
		h.reject(c, "dream_resume", in.MessageID, ErrRunGone)
		h.sendDream(c, nil)
		return
	}
	m, found := run.ByKey(in.Key)
	if !found {
		h.reject(c, "dream_resume", in.MessageID, ErrNotDreaming)
		h.sendDream(c, nil)
		return
	}
	if m.UserID != c.ID {
		// A run on the server it was played on keeps the member's seat in
		// its fight under their old connection; this one takes it over.
		old := m.UserID
		m.UserID = c.ID
		if sess, ok := h.sessions.ByUser(old); ok && sess.RunID == run.ID {
			sess.RunID = ""
		}
	}
	c.Session.RunID = run.ID
	slog.Info("dream resumed", "component", "dream", "run_id", run.ID, "user_id", c.ID)
	h.broadcastDream(run)
}

func handleDreamLeave(h *Hub, c *Client, data []byte) {
	var in types.BaseMessage
	if !decode(c, "dream_leave", data, &in) {
		return
	}
	run, ok := h.inRun(c, "dream_leave", in.MessageID)
	if !ok {
		return
	}
	h.leaveRun(c.Session, c.ID, run)
	h.sendDream(c, nil)
	if room, ok := h.currentRoom(c); ok && room.Run == run.ID {
		room.Game.RemovePlayer(c.ID)
		h.setRoom(c, "")
		h.sendRoomJoined(c, "", "")
		if !h.closeRoomIfEmpty(room) {
			h.broadcastGameState(room)
		}
		h.sendLobby(c)
	}
}

// leaveRun takes a member out of their run, for good.
func (h *Hub) leaveRun(sess *Session, userID string, run *dream.Run) {
	if err := run.Leave(userID, game.Content(), time.Now()); err != nil {
		return
	}
	sess.RunID = ""
	slog.Info("dream left", "component", "dream", "run_id", run.ID, "user_id", userID)
	h.afterRunChange(run)
}

func handleDreamStart(h *Hub, c *Client, data []byte) {
	var in types.BaseMessage
	if !decode(c, "dream_start", data, &in) {
		return
	}
	run, ok := h.inRun(c, "dream_start", in.MessageID)
	if !ok {
		return
	}
	if err := run.Start(c.ID, game.Content(), time.Now()); err != nil {
		h.reject(c, "dream_start", in.MessageID, err)
		return
	}
	slog.Info("dream started", "component", "dream", "run_id", run.ID, "party", run.StartSize)
	h.broadcastDream(run)
}

func handleDreamPoint(h *Hub, c *Client, data []byte) {
	var in types.DreamRoomIn
	if !decode(c, "dream_point", data, &in) {
		return
	}
	run, ok := h.inRun(c, "dream_point", in.MessageID)
	if !ok {
		return
	}
	if err := run.Point(c.ID, in.Room); err != nil {
		h.reject(c, "dream_point", in.MessageID, err)
		return
	}
	h.broadcastDream(run)
}

// handleDreamEnter takes the party into the room its leader chose: a private
// room for the fight, the monsters seated, every member still climbing
// seated on the party's side with the boons they carry.
func handleDreamEnter(h *Hub, c *Client, data []byte) {
	var in types.DreamRoomIn
	if !decode(c, "dream_enter", data, &in) {
		return
	}
	run, ok := h.inRun(c, "dream_enter", in.MessageID)
	if !ok {
		return
	}
	room, err := run.Enter(c.ID, in.Room)
	if err != nil {
		h.reject(c, "dream_enter", in.MessageID, err)
		return
	}
	if err := h.openFloor(run, room); err != nil {
		slog.Error("could not open a floor", "component", "dream", "run_id", run.ID, "error", err)
		run.Phase = dream.PhaseRoom
		run.Chosen = -1
		h.reject(c, "dream_enter", in.MessageID, errors.New("that room could not be opened, try again"))
	}
	h.broadcastDream(run)
}

func (h *Hub) openFloor(run *dream.Run, room dream.Room) error {
	cat := game.Content()
	active := run.Active()
	opts := dream.FightOptions(cat, room, len(active), 0, h.cfg.TurnDuration)
	fight, err := h.lobby.CreateFight(fmt.Sprintf("Dream %s, floor %d", run.ID, run.Floor), opts, run.ID)
	if err != nil {
		return err
	}
	if err := dream.SeatMonsters(fight.Game, room); err != nil {
		h.lobby.Remove(fight.ID)
		return err
	}
	for _, m := range active {
		if err := fight.Game.AddPlayerSeated(m.UserID, m.Look.Name, m.Look, run.Seat(m, cat)); err != nil {
			h.lobby.Remove(fight.ID)
			return err
		}
	}

	h.mutex.Lock()
	clients := map[string]*Client{}
	for client := range h.Clients {
		clients[client.ID] = client
	}
	h.mutex.Unlock()
	for _, m := range active {
		if client, ok := clients[m.UserID]; ok {
			h.setRoom(client, fight.ID)
			h.sendRoomJoined(client, fight.ID, fight.Name)
			continue
		}
		// Someone away when the leader went in is seated anyway, and has
		// the usual grace to come back before their place is forfeit.
		if sess, ok := h.sessions.ByUser(m.UserID); ok {
			sess.RoomID = fight.ID
			fight.Game.SetConnected(m.UserID, false)
			h.sessions.startForfeit(sess, h.Forfeits)
		}
	}
	slog.Info("dream floor opened", "component", "dream", "run_id", run.ID, "floor", run.Floor,
		"room", room.Index, "match_id", fight.ID, "monsters", len(room.Monsters), "boss", room.Boss != nil)
	h.broadcastGameState(fight)
	return nil
}

func handleDreamBoon(h *Hub, c *Client, data []byte) {
	var in types.DreamBoonIn
	if !decode(c, "dream_boon", data, &in) {
		return
	}
	run, ok := h.inRun(c, "dream_boon", in.MessageID)
	if !ok {
		return
	}
	if _, err := run.PickBoon(c.ID, in.Boon, game.Content()); err != nil {
		h.reject(c, "dream_boon", in.MessageID, err)
		return
	}
	h.afterRunChange(run)
}

// ---------------------------------------------------------------------------
// Fights ending, and the clock
// ---------------------------------------------------------------------------

// onDreamFightOver closes a floor once its fight is over: the run hears how
// it went, and the party is taken back out of the room after a moment.
func (h *Hub) onDreamFightOver(room *game.Room, matchID string) {
	run, ok := h.dreams.runs[room.Run]
	if !ok || run.Phase != dream.PhaseFighting || h.dreams.leaving[room.ID] {
		return
	}
	snap := room.Game.Snapshot()
	outcome := dream.Outcome{
		Won:        room.Game.WinnerTeam() == game.TeamParty,
		Turns:      snap.TurnNumber,
		MatchID:    matchID,
		SecondWind: map[string]bool{},
	}
	for id, p := range snap.Players {
		if p.SecondWindSpent {
			outcome.SecondWind[id] = true
		}
	}
	run.FightOver(outcome, game.Content(), time.Now())
	slog.Info("dream floor over", "component", "dream", "run_id", run.ID, "floor", run.Cleared, "won", outcome.Won)
	h.dreams.leaving[room.ID] = true
	roomID := room.ID
	time.AfterFunc(afterFightDelay, func() {
		select {
		case h.RunTicks <- runTick{run: run.ID, leaveRoom: roomID}:
		default:
		}
	})
	h.afterRunChange(run)
}

// abandonFloor ends a floor whose fight nobody of the party is left in.
func (h *Hub) abandonFloor(room *game.Room) {
	delete(h.dreams.leaving, room.ID)
	run, ok := h.dreams.runs[room.Run]
	if !ok || run.Phase != dream.PhaseFighting {
		return
	}
	run.FightOver(dream.Outcome{Turns: room.Game.Snapshot().TurnNumber}, game.Content(), time.Now())
	slog.Info("dream floor abandoned", "component", "dream", "run_id", run.ID, "floor", run.Floor)
	h.afterRunChange(run)
}

// runTick is a timer going off for a run: the boons' clock, or a finished
// fight to take the party out of.
type runTick struct {
	run       string
	leaveRoom string
}

func (h *Hub) onRunTick(t runTick) {
	if t.leaveRoom != "" {
		h.leaveFightRoom(t.leaveRoom)
		return
	}
	delete(h.dreams.timers, t.run)
	run, ok := h.dreams.runs[t.run]
	if !ok {
		return
	}
	if run.Over() {
		if time.Since(run.EndedAt) >= overRunLinger {
			delete(h.dreams.runs, run.ID)
		}
		return
	}
	if run.ExpireBoons(time.Now(), game.Content()) {
		h.afterRunChange(run)
		return
	}
	h.armRun(run)
}

// leaveFightRoom takes the party out of a floor's finished fight and closes
// the room.
func (h *Hub) leaveFightRoom(roomID string) {
	delete(h.dreams.leaving, roomID)
	room, ok := h.lobby.Get(roomID)
	if !ok {
		return
	}
	run := h.dreams.runs[room.Run]
	h.mutex.Lock()
	var clients []*Client
	for client := range h.Clients {
		if client.RoomID == roomID {
			clients = append(clients, client)
		}
	}
	h.mutex.Unlock()
	for _, client := range clients {
		h.setRoom(client, "")
		h.sendRoomJoined(client, "", "")
		if run != nil {
			h.sendDream(client, run)
		}
	}
	if timer := h.roomTimers[roomID]; timer != nil {
		timer.Stop()
		delete(h.roomTimers, roomID)
	}
	h.lobby.Remove(roomID)
	delete(h.persistedRooms, roomID)
	if run != nil {
		for _, m := range run.Members {
			if sess, ok := h.sessions.ByUser(m.UserID); ok && sess.RoomID == roomID {
				sess.RoomID = ""
				h.sessions.stopForfeit(sess)
			}
		}
	}
	h.refreshRoomMetrics()
}

// afterRunChange tells the party, saves the run and arms its clock.
func (h *Hub) afterRunChange(run *dream.Run) {
	h.broadcastDream(run)
	h.armRun(run)
	if run.Over() {
		slog.Info("dream over", "component", "dream", "run_id", run.ID, "cleared", run.Cleared, "party", run.StartSize, "turns", run.Turns)
	}
}

// armRun sets the one timer a run needs, if any: the boons' deadline, or the
// moment a finished run is forgotten.
func (h *Hub) armRun(run *dream.Run) {
	if timer := h.dreams.timers[run.ID]; timer != nil {
		timer.Stop()
		delete(h.dreams.timers, run.ID)
	}
	var delay time.Duration
	switch {
	case run.Over():
		delay = overRunLinger
	case run.Phase == dream.PhaseBoons:
		delay = max(0, time.Until(run.BoonDeadline))
	default:
		return
	}
	id := run.ID
	h.dreams.timers[id] = time.AfterFunc(delay, func() {
		select {
		case h.RunTicks <- runTick{run: id}:
		default:
		}
	})
}

// onDreamDisconnect gives a member away from a run, out of any fight, the
// same grace a player in a fight gets before their place is forfeit.
func (h *Hub) onDreamDisconnect(c *Client) {
	run, ok := h.runOf(c)
	if !ok || run.Over() || c.RoomID != "" {
		return
	}
	h.sessions.startForfeit(c.Session, h.Forfeits)
	h.broadcastDream(run)
}

// onDreamForfeit takes a member who never came back out of their run.
func (h *Hub) onDreamForfeit(sess *Session, userID string) {
	run, ok := h.dreams.runs[sess.RunID]
	if !ok || run.Over() {
		return
	}
	h.leaveRun(sess, userID, run)
}
