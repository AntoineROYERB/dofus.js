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

// The iOS shell serves its page from the app bundle, so the handshake carries
// Origin: capacitor://localhost. Production refused it with a 403 until the
// allow list learned to hold an origin that is not a web address.
func TestOriginAllowedAdmitsTheMobileShells(t *testing.T) {
	cfg := Config{AllowedOrigins: []string{
		"https://dofusjs.onrender.com",
		"capacitor://localhost",
		"https://localhost",
	}}

	for _, origin := range []string{
		"capacitor://localhost",
		"CAPACITOR://LocalHost",
		"https://localhost",
	} {
		if !cfg.OriginAllowed(origin) {
			t.Errorf("OriginAllowed(%q) = false, want true", origin)
		}
	}

	// Sharing localhost with the shells must not hand the host to a page an
	// attacker serves from the victim's own machine.
	for _, origin := range []string{"http://localhost", "http://localhost:5173"} {
		if cfg.OriginAllowed(origin) {
			t.Errorf("OriginAllowed(%q) = true, want false", origin)
		}
	}
}

// A bare hostname stays lenient about the scheme: that is the whole reason it
// is accepted, since some platforms only expose the host.
func TestOriginAllowedKeepsBareHostnamesSchemeAgnostic(t *testing.T) {
	cfg := Config{AllowedOrigins: []string{"dofusjs.onrender.com"}}

	for _, origin := range []string{
		"https://dofusjs.onrender.com",
		"http://dofusjs.onrender.com",
	} {
		if !cfg.OriginAllowed(origin) {
			t.Errorf("OriginAllowed(%q) = false, want true", origin)
		}
	}

	// An entry that spells out a scheme asks for that scheme.
	strict := Config{AllowedOrigins: []string{"https://dofusjs.onrender.com"}}
	if strict.OriginAllowed("http://dofusjs.onrender.com") {
		t.Error("an https entry admitted a plain http origin")
	}
}
