package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"game-server/internal/store"
	"game-server/internal/store/memory"
	"game-server/internal/websocket"

	"golang.org/x/oauth2"
)

// newTestService builds a Service wired to a fake Google provider and an
// in-memory store, so a full login round trip needs neither a live network
// call nor a database.
func newTestService(t *testing.T, matches store.MatchStore, fg *fakeGoogle) (*Service, *websocket.Sessions) {
	t.Helper()
	sessions := websocket.NewSessions()
	svc := New(Config{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		RedirectURL:  "http://backend.example/auth/google/callback",
		CookieSecret: "test-cookie-secret",
		FrontendURL:  "http://frontend.example",
		CookieSecure: true,
	}, sessions, NewMemoryUserStore(matches))
	svc.oauthConf.Endpoint = oauth2.Endpoint{AuthURL: fg.authURL(), TokenURL: fg.tokenURL()}
	svc.userInfoURL = fg.userInfoURL()
	return svc, sessions
}

// noRedirectClient never follows a redirect, so the test can inspect the
// Location and Set-Cookie headers of the response that issued it.
func noRedirectClient() *http.Client {
	return &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}}
}

func newTestServer(t *testing.T, svc *Service) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	RegisterRoutes(mux, svc, func(string) bool { return true })
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestLoginCallbackHappyPath(t *testing.T) {
	fg := newFakeGoogle(GoogleUser{Sub: "google-sub-1", Email: "alice@example.com", Name: "Alice"})
	t.Cleanup(fg.Close)
	matches := memory.New()
	svc, sessions := newTestService(t, matches, fg)
	srv := newTestServer(t, svc)
	client := noRedirectClient()

	anon, err := sessions.Create()
	if err != nil {
		t.Fatalf("sessions.Create: %v", err)
	}

	loginResp, err := client.Get(srv.URL + "/auth/google/login?token=" + anon.Token)
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	loginResp.Body.Close()
	if loginResp.StatusCode != http.StatusFound {
		t.Fatalf("login status = %d, want %d", loginResp.StatusCode, http.StatusFound)
	}
	loc, err := url.Parse(loginResp.Header.Get("Location"))
	if err != nil {
		t.Fatalf("parse Location: %v", err)
	}
	state := loc.Query().Get("state")
	if state == "" {
		t.Fatalf("login redirect missing state param: %s", loc)
	}
	if loc.Query().Get("code_challenge") == "" {
		t.Fatalf("login redirect missing PKCE code_challenge: %s", loc)
	}

	cbResp, err := client.Get(srv.URL + "/auth/google/callback?state=" + state + "&code=fake-code")
	if err != nil {
		t.Fatalf("callback: %v", err)
	}
	cbResp.Body.Close()
	if cbResp.StatusCode != http.StatusFound {
		t.Fatalf("callback status = %d, want %d", cbResp.StatusCode, http.StatusFound)
	}
	if got := cbResp.Header.Get("Location"); got != "http://frontend.example/profile" {
		t.Fatalf("callback redirected to %q, want the frontend profile page", got)
	}

	var cookie *http.Cookie
	for _, c := range cbResp.Cookies() {
		if c.Name == sessionCookieName {
			cookie = c
		}
	}
	if cookie == nil {
		t.Fatalf("callback did not set the session cookie")
	}
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteNoneMode {
		t.Fatalf("cookie flags = %+v, want HttpOnly+Secure+SameSite=None", cookie)
	}
	token, ok := verifyCookie(cookie.Value, svc.cookieSecret)
	if !ok || token != anon.Token {
		t.Fatalf("cookie does not carry the linked session's resume token")
	}

	sess, resumed := sessions.Resume(anon.Token)
	if !resumed || sess.AccountID == nil {
		t.Fatalf("anonymous session was not linked to an account")
	}

	sessResp, err := client.Do(withCookie(newReq(t, srv.URL+"/auth/session"), cookie))
	if err != nil {
		t.Fatalf("session: %v", err)
	}
	defer sessResp.Body.Close()
	if sessResp.StatusCode != http.StatusOK {
		t.Fatalf("session status = %d, want 200", sessResp.StatusCode)
	}
	var got sessionResponse
	decodeJSON(t, sessResp, &got)
	if got.Email != "alice@example.com" || got.DisplayName != "Alice" {
		t.Fatalf("session response = %+v, want alice@example.com/Alice", got)
	}
}

func TestCallbackUpsertsRatherThanDuplicates(t *testing.T) {
	fg := newFakeGoogle(GoogleUser{Sub: "google-sub-2", Email: "bob@example.com", Name: "Bob"})
	t.Cleanup(fg.Close)
	matches := memory.New()
	svc, sessions := newTestService(t, matches, fg)
	srv := newTestServer(t, svc)
	client := noRedirectClient()

	firstID := signInFresh(t, srv, client, sessions)

	fg.SetUser(GoogleUser{Sub: "google-sub-2", Email: "bob-new-email@example.com", Name: "Bob"})
	secondID := signInFresh(t, srv, client, sessions)

	if firstID != secondID {
		t.Fatalf("two sign-ins of the same google account produced different user ids: %d vs %d", firstID, secondID)
	}
}

func TestClaimingPastMatches(t *testing.T) {
	fg := newFakeGoogle(GoogleUser{Sub: "google-sub-3", Email: "carol@example.com", Name: "Carol"})
	t.Cleanup(fg.Close)
	matches := memory.New()
	svc, sessions := newTestService(t, matches, fg)
	srv := newTestServer(t, svc)
	client := noRedirectClient()

	anon, err := sessions.Create()
	if err != nil {
		t.Fatalf("sessions.Create: %v", err)
	}
	seedMatchFor(t, matches, "match-1", anon.UserID)

	cookie := signIn(t, srv, client, anon.Token)

	myMatches := fetchMatchesWithCookie(t, client, srv.URL+"/auth/matches", cookie)
	if len(myMatches.Matches) != 1 || myMatches.Matches[0].ID != "match-1" {
		t.Fatalf("claimed matches = %+v, want [match-1]", myMatches)
	}

	page, err := matches.ListMatches(t.Context(), 20, "")
	if err != nil {
		t.Fatalf("ListMatches: %v", err)
	}
	if len(page.Matches) != 1 || page.Matches[0].ID != "match-1" {
		t.Fatalf("public projection changed after claiming: %+v", page)
	}
}

func TestLogoutKeepsAnonymousSessionAlive(t *testing.T) {
	fg := newFakeGoogle(GoogleUser{Sub: "google-sub-4", Email: "dave@example.com", Name: "Dave"})
	t.Cleanup(fg.Close)
	matches := memory.New()
	svc, sessions := newTestService(t, matches, fg)
	srv := newTestServer(t, svc)
	client := noRedirectClient()

	anon, err := sessions.Create()
	if err != nil {
		t.Fatalf("sessions.Create: %v", err)
	}
	cookie := signIn(t, srv, client, anon.Token)

	logoutResp, err := client.Do(withCookie(newReqMethod(t, http.MethodPost, srv.URL+"/auth/logout"), cookie))
	if err != nil {
		t.Fatalf("logout: %v", err)
	}
	logoutResp.Body.Close()
	if logoutResp.StatusCode != http.StatusNoContent {
		t.Fatalf("logout status = %d, want 204", logoutResp.StatusCode)
	}

	sess, resumed := sessions.Resume(anon.Token)
	if !resumed {
		t.Fatalf("logout must not drop the anonymous session")
	}
	if sess.AccountID != nil {
		t.Fatalf("logout must clear the account link")
	}

	sessResp, err := client.Do(withCookie(newReq(t, srv.URL+"/auth/session"), cookie))
	if err != nil {
		t.Fatalf("session after logout: %v", err)
	}
	sessResp.Body.Close()
	if sessResp.StatusCode != http.StatusNoContent {
		t.Fatalf("session after logout status = %d, want 204 (cookie was cleared)", sessResp.StatusCode)
	}
}

func TestCallbackRejectsUnknownState(t *testing.T) {
	fg := newFakeGoogle(GoogleUser{Sub: "google-sub-5"})
	t.Cleanup(fg.Close)
	svc, _ := newTestService(t, memory.New(), fg)
	srv := newTestServer(t, svc)

	resp, err := noRedirectClient().Get(srv.URL + "/auth/google/callback?state=never-issued&code=whatever")
	if err != nil {
		t.Fatalf("callback: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
	if len(resp.Cookies()) != 0 {
		t.Fatalf("an unknown state must not set a cookie")
	}
	if _, err := svc.users.GetUser(t.Context(), 1); err == nil {
		t.Fatalf("an unknown state must not create a user")
	}
}

func TestLoginIsRateLimited(t *testing.T) {
	fg := newFakeGoogle(GoogleUser{Sub: "google-sub-6"})
	t.Cleanup(fg.Close)
	svc, _ := newTestService(t, memory.New(), fg)
	srv := newTestServer(t, svc)
	client := noRedirectClient()

	var last *http.Response
	for i := 0; i < 11; i++ {
		resp, err := client.Get(srv.URL + "/auth/google/login")
		if err != nil {
			t.Fatalf("login attempt %d: %v", i, err)
		}
		resp.Body.Close()
		last = resp
	}
	if last.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("11th login attempt status = %d, want 429", last.StatusCode)
	}
}

// --- helpers ---

func signInFresh(t *testing.T, srv *httptest.Server, client *http.Client, sessions *websocket.Sessions) int64 {
	t.Helper()
	anon, err := sessions.Create()
	if err != nil {
		t.Fatalf("sessions.Create: %v", err)
	}
	cookie := signIn(t, srv, client, anon.Token)
	sessResp, err := client.Do(withCookie(newReq(t, srv.URL+"/auth/session"), cookie))
	if err != nil {
		t.Fatalf("session: %v", err)
	}
	defer sessResp.Body.Close()
	var got sessionResponse
	decodeJSON(t, sessResp, &got)
	return got.ID
}

// signIn drives a full login+callback round trip for an existing anonymous
// resume token and returns the resulting session cookie.
func signIn(t *testing.T, srv *httptest.Server, client *http.Client, anonymousToken string) *http.Cookie {
	t.Helper()
	loginResp, err := client.Get(srv.URL + "/auth/google/login?token=" + anonymousToken)
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	loginResp.Body.Close()
	loc, err := url.Parse(loginResp.Header.Get("Location"))
	if err != nil {
		t.Fatalf("parse Location: %v", err)
	}
	state := loc.Query().Get("state")

	cbResp, err := client.Get(srv.URL + "/auth/google/callback?state=" + state + "&code=fake-code")
	if err != nil {
		t.Fatalf("callback: %v", err)
	}
	cbResp.Body.Close()

	for _, c := range cbResp.Cookies() {
		if c.Name == sessionCookieName {
			return c
		}
	}
	t.Fatalf("callback did not set the session cookie")
	return nil
}

func seedMatchFor(t *testing.T, matches *memory.Store, matchID, anonymousID string) {
	t.Helper()
	m := store.Match{
		ID:        matchID,
		RoomID:    "room-1",
		RoomName:  "Arena",
		StartedAt: time.Now().Add(-time.Minute),
		EndedAt:   time.Now(),
		Winner:    anonymousID,
		Turns:     3,
		Players:   []store.Player{{UserID: anonymousID, UserName: "Player"}},
	}
	if err := matches.SaveMatch(t.Context(), m); err != nil {
		t.Fatalf("seed SaveMatch: %v", err)
	}
}

func fetchMatchesWithCookie(t *testing.T, client *http.Client, url string, cookie *http.Cookie) store.Page {
	t.Helper()
	resp, err := client.Do(withCookie(newReq(t, url), cookie))
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET %s status = %d, want 200", url, resp.StatusCode)
	}
	var page store.Page
	decodeJSON(t, resp, &page)
	return page
}

func newReq(t *testing.T, url string) *http.Request {
	return newReqMethod(t, http.MethodGet, url)
}

func newReqMethod(t *testing.T, method, url string) *http.Request {
	t.Helper()
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	return req
}

func withCookie(req *http.Request, cookie *http.Cookie) *http.Request {
	req.AddCookie(cookie)
	return req
}

func decodeJSON(t *testing.T, resp *http.Response, dest any) {
	t.Helper()
	if err := json.NewDecoder(resp.Body).Decode(dest); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}
