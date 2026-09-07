package auth

import (
	"net/http"
	"testing"
)

func TestSignAndVerifyCookieRoundTrip(t *testing.T) {
	secret := []byte("test-secret")
	value := signToken("abc123", secret)

	token, ok := verifyCookie(value, secret)
	if !ok {
		t.Fatalf("verifyCookie rejected a value it signed itself")
	}
	if token != "abc123" {
		t.Fatalf("verifyCookie returned token %q, want %q", token, "abc123")
	}
}

func TestVerifyCookieRejectsTampering(t *testing.T) {
	secret := []byte("test-secret")
	value := signToken("abc123", secret)

	// Same signature, different claimed token.
	tampered := "attacker" + value[len("abc123"):]
	if _, ok := verifyCookie(tampered, secret); ok {
		t.Fatalf("verifyCookie accepted a token swapped under an unrelated signature")
	}

	wrongSecret := []byte("different-secret")
	if _, ok := verifyCookie(value, wrongSecret); ok {
		t.Fatalf("verifyCookie accepted a signature made with a different secret")
	}
}

func TestVerifyCookieRejectsMalformed(t *testing.T) {
	secret := []byte("test-secret")
	for _, raw := range []string{"", "no-dot-here", ".leading-dot-sig", "trailing-dot."} {
		if _, ok := verifyCookie(raw, secret); ok {
			t.Fatalf("verifyCookie accepted malformed value %q", raw)
		}
	}
}

func TestSameSite(t *testing.T) {
	if got := sameSite(true); got != http.SameSiteNoneMode {
		t.Fatalf("sameSite(true) = %v, want SameSiteNoneMode", got)
	}
	if got := sameSite(false); got != http.SameSiteLaxMode {
		t.Fatalf("sameSite(false) = %v, want SameSiteLaxMode", got)
	}
}
