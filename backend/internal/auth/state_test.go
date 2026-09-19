package auth

import "testing"

func TestStateStoreRoundTrip(t *testing.T) {
	s := newStateStore()

	state, verifier, err := s.Create("anon-token")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if state == "" || verifier == "" {
		t.Fatalf("Create returned empty state or verifier")
	}

	entry, ok := s.Consume(state)
	if !ok {
		t.Fatalf("Consume: expected the freshly created state to be found")
	}
	if entry.Verifier != verifier || entry.AnonymousToken != "anon-token" {
		t.Fatalf("Consume returned %+v, want verifier %q and anonymous token %q", entry, verifier, "anon-token")
	}
}

func TestStateStoreConsumeIsOneShot(t *testing.T) {
	s := newStateStore()
	state, _, _ := s.Create("")

	if _, ok := s.Consume(state); !ok {
		t.Fatalf("first Consume should succeed")
	}
	if _, ok := s.Consume(state); ok {
		t.Fatalf("second Consume of the same state should fail")
	}
}

func TestStateStoreConsumeUnknown(t *testing.T) {
	s := newStateStore()
	if _, ok := s.Consume("never-issued"); ok {
		t.Fatalf("Consume of an unknown state should fail")
	}
}

func TestStateStoreExpired(t *testing.T) {
	s := newStateStore()
	state, _, _ := s.Create("")

	// Force the entry into the past instead of sleeping past the real TTL.
	s.mu.Lock()
	entry := s.entries[state]
	entry.ExpiresAt = entry.ExpiresAt.Add(-2 * stateTTL)
	s.entries[state] = entry
	s.mu.Unlock()

	if _, ok := s.Consume(state); ok {
		t.Fatalf("Consume of an expired state should fail")
	}
}
