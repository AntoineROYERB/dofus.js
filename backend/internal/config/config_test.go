package config

import "testing"

func TestOriginAllowedAcceptsOriginsAndBareHosts(t *testing.T) {
	cfg := Config{AllowedOrigins: []string{"https://dofusjs.onrender.com"}}

	allowed := []string{
		"https://dofusjs.onrender.com",
		"HTTPS://DofusJS.OnRender.com",
	}
	for _, origin := range allowed {
		if !cfg.OriginAllowed(origin) {
			t.Errorf("OriginAllowed(%q) = false, want true", origin)
		}
	}

	// A platform that only exposes the hostname must configure just as well.
	byHost := Config{AllowedOrigins: []string{"dofusjs.onrender.com"}}
	if !byHost.OriginAllowed("https://dofusjs.onrender.com") {
		t.Error("a bare hostname in the allow list did not match a full origin")
	}

	for _, origin := range []string{"https://evil.example", "http://localhost:5173"} {
		if cfg.OriginAllowed(origin) {
			t.Errorf("OriginAllowed(%q) = true, want false", origin)
		}
	}
}

func TestOriginAllowedLetsThroughNonBrowserAndWildcard(t *testing.T) {
	cfg := Config{AllowedOrigins: []string{"https://dofusjs.onrender.com"}}
	if !cfg.OriginAllowed("") {
		t.Error("a request with no Origin header was refused")
	}

	any := Config{AllowedOrigins: []string{"*"}}
	if !any.AllowsAnyOrigin() || !any.OriginAllowed("https://anything.example") {
		t.Error("the wildcard did not allow every origin")
	}
}

func TestOriginHostStripsSchemeAndPath(t *testing.T) {
	cases := map[string]string{
		"https://a.example/path?q=1": "a.example",
		"wss://b.example:8080/ws":    "b.example:8080",
		"c.example":                  "c.example",
		"  d.example  ":              "d.example",
	}
	for in, want := range cases {
		if got := originHost(in); got != want {
			t.Errorf("originHost(%q) = %q, want %q", in, got, want)
		}
	}
}
