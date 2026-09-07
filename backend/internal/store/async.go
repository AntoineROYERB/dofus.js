package store

import (
	"context"
	"log"
	"sync/atomic"

	"game-server/internal/game"
)

// Async wraps a MatchStore so SaveMatch never blocks or fails the caller.
// A finished match is buffered onto a channel a background goroutine
// drains; if the buffer is full (the store is slow or unreachable) the
// write is dropped and counted, on the theory that a lost recording is
// acceptable but a stuttering fight is not. Reads pass straight through:
// they run off the hub's goroutine, on an HTTP handler, so there is nothing
// to protect them from.
type Async struct {
	inner   MatchStore
	writes  chan Match
	done    chan struct{}
	dropped atomic.Int64
}

// NewAsync starts the background writer. bufferSize is how many finished
// matches can be queued before writes start dropping; 32 comfortably
// outpaces how often a room can finish a match.
func NewAsync(inner MatchStore, bufferSize int) *Async {
	if bufferSize <= 0 {
		bufferSize = 32
	}
	a := &Async{
		inner:  inner,
		writes: make(chan Match, bufferSize),
		done:   make(chan struct{}),
	}
	go a.run()
	return a
}

func (a *Async) run() {
	defer close(a.done)
	for m := range a.writes {
		if err := a.inner.SaveMatch(context.Background(), m); err != nil {
			log.Printf("[store] failed to save match %s: %v", m.ID, err)
		}
	}
}

// SaveMatch never blocks: it enqueues and returns, or drops the write and
// records that it did.
func (a *Async) SaveMatch(_ context.Context, m Match) error {
	select {
	case a.writes <- m:
	default:
		n := a.dropped.Add(1)
		log.Printf("[store] dropped match %s: writer is backed up (%d dropped so far)", m.ID, n)
	}
	return nil
}

// Dropped reports how many matches have been dropped since startup.
func (a *Async) Dropped() int64 { return a.dropped.Load() }

func (a *Async) ListMatches(ctx context.Context, limit int, cursor string) (Page, error) {
	return a.inner.ListMatches(ctx, limit, cursor)
}

func (a *Async) GetSummary(ctx context.Context, id string) (Summary, error) {
	return a.inner.GetSummary(ctx, id)
}

func (a *Async) GetRecording(ctx context.Context, id string) (game.Recording, error) {
	return a.inner.GetRecording(ctx, id)
}

func (a *Async) Reproject(ctx context.Context, id string) error {
	return a.inner.Reproject(ctx, id)
}

// Close stops accepting writes, waits for the queue to drain, and closes
// the underlying store.
func (a *Async) Close() error {
	close(a.writes)
	<-a.done
	return a.inner.Close()
}

var _ MatchStore = (*Async)(nil)
