package store

import (
	"context"
	"sync"
	"testing"
	"time"

	"game-server/internal/game"
)

// blockingStore lets a test hold SaveMatch open to prove Async.SaveMatch
// never blocks the caller, and to observe what eventually landed.
type blockingStore struct {
	mu      sync.Mutex
	block   chan struct{}
	saved   []Match
	release func()
}

func newBlockingStore() *blockingStore {
	return &blockingStore{block: make(chan struct{})}
}

func (b *blockingStore) SaveMatch(_ context.Context, m Match) error {
	<-b.block
	b.mu.Lock()
	b.saved = append(b.saved, m)
	b.mu.Unlock()
	return nil
}
func (b *blockingStore) ListMatches(context.Context, int, string) (Page, error) { return Page{}, nil }
func (b *blockingStore) GetSummary(context.Context, string) (Summary, error)    { return Summary{}, nil }
func (b *blockingStore) GetRecording(context.Context, string) (game.Recording, error) {
	return game.Recording{}, nil
}
func (b *blockingStore) Reproject(context.Context, string) error { return nil }
func (b *blockingStore) Close() error                            { return nil }

func (b *blockingStore) savedCount() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.saved)
}

func TestAsyncSaveMatchDoesNotBlock(t *testing.T) {
	inner := newBlockingStore() // never unblocked in this test
	a := NewAsync(inner, 2)
	defer func() {
		close(inner.block)
		a.Close()
	}()

	done := make(chan struct{})
	go func() {
		_ = a.SaveMatch(context.Background(), Match{ID: "m1"})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("SaveMatch blocked even though the writer goroutine is still draining the buffer")
	}
}

func TestAsyncDropsWhenBufferIsFull(t *testing.T) {
	inner := newBlockingStore()
	a := NewAsync(inner, 1)
	defer func() {
		close(inner.block)
		a.Close()
	}()

	// The writer goroutine picks up the first match and blocks inside
	// inner.SaveMatch, so the buffer (size 1) fills on the second and
	// overflows on the third.
	_ = a.SaveMatch(context.Background(), Match{ID: "m1"})
	time.Sleep(50 * time.Millisecond) // let the writer goroutine claim m1
	_ = a.SaveMatch(context.Background(), Match{ID: "m2"})
	_ = a.SaveMatch(context.Background(), Match{ID: "m3"})

	if got := a.Dropped(); got != 1 {
		t.Errorf("Dropped() = %d, want 1", got)
	}
}

func TestAsyncEventuallySaves(t *testing.T) {
	inner := newBlockingStore()
	a := NewAsync(inner, 4)

	_ = a.SaveMatch(context.Background(), Match{ID: "m1"})
	close(inner.block)

	deadline := time.After(time.Second)
	for inner.savedCount() < 1 {
		select {
		case <-deadline:
			t.Fatal("match was never saved by the background writer")
		case <-time.After(time.Millisecond):
		}
	}
	if err := a.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
}

var _ MatchStore = (*blockingStore)(nil)
