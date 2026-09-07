package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
)

// fakeGoogle stands in for Google's token and userinfo endpoints in tests,
// so nothing in this package ever makes a live network call. Any code
// (typically an authorization code) exchanges for a fixed token; the
// userinfo response is whatever User currently holds, settable per test.
type fakeGoogle struct {
	Server *httptest.Server

	mu   sync.Mutex
	user GoogleUser
}

func newFakeGoogle(user GoogleUser) *fakeGoogle {
	fg := &fakeGoogle{user: user}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"access_token": "fake-access-token",
			"token_type":   "Bearer",
			"expires_in":   3600,
		})
	})
	mux.HandleFunc("GET /userinfo", func(w http.ResponseWriter, r *http.Request) {
		fg.mu.Lock()
		u := fg.user
		fg.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(u)
	})

	fg.Server = httptest.NewServer(mux)
	return fg
}

func (fg *fakeGoogle) SetUser(u GoogleUser) {
	fg.mu.Lock()
	defer fg.mu.Unlock()
	fg.user = u
}

func (fg *fakeGoogle) Close() { fg.Server.Close() }

func (fg *fakeGoogle) tokenURL() string    { return fg.Server.URL + "/token" }
func (fg *fakeGoogle) authURL() string     { return fg.Server.URL + "/authorize" }
func (fg *fakeGoogle) userInfoURL() string { return fg.Server.URL + "/userinfo" }
