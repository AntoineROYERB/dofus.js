package auth

import (
	"testing"
	"time"
)

func TestRateLimiterAllowsUpToLimit(t *testing.T) {
	l := newRateLimiter(3, time.Minute)

	for i := 0; i < 3; i++ {
		if !l.Allow("1.2.3.4") {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
	if l.Allow("1.2.3.4") {
		t.Fatalf("request over the limit should be rejected")
	}
}

func TestRateLimiterKeysAreIndependent(t *testing.T) {
	l := newRateLimiter(1, time.Minute)

	if !l.Allow("1.2.3.4") {
		t.Fatalf("first request from 1.2.3.4 should be allowed")
	}
	if !l.Allow("5.6.7.8") {
		t.Fatalf("a different key should have its own allowance")
	}
	if l.Allow("1.2.3.4") {
		t.Fatalf("1.2.3.4 already used its allowance")
	}
}

func TestRateLimiterWindowResets(t *testing.T) {
	l := newRateLimiter(1, 10*time.Millisecond)

	if !l.Allow("1.2.3.4") {
		t.Fatalf("first request should be allowed")
	}
	if l.Allow("1.2.3.4") {
		t.Fatalf("second request within the window should be rejected")
	}
	time.Sleep(20 * time.Millisecond)
	if !l.Allow("1.2.3.4") {
		t.Fatalf("request after the window elapsed should be allowed")
	}
}
