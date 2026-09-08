// Package auth adds optional accounts on top of anonymous play: a browser
// that already has a resume token (see internal/websocket.Sessions) can link
// it to a Google account without losing what it already played.
//
// The invariant this package must never break, from internal/types/message.go:
// an inbound WebSocket message never carries a user id, because a client
// must not be able to claim an identity. Account identity here is resolved
// only from an HTTP cookie (set by this package, read by this package) or
// from a server-side Session lookup — never from anything a client sends as
// game-message JSON. HandleWebSocket in internal/websocket never reads this
// package's cookie; the two identity transports (WS resume token, HTTP
// session cookie) stay independent, and only meet through the shared
// *websocket.Sessions store.
package auth

import (
	"time"

	"game-server/internal/websocket"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// Config is what Service needs to run. Callers build it from
// internal/config.Config; GoogleOAuthConfigured() on that type is what
// decides whether main.go constructs a Service at all.
type Config struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
	// CookieSecret signs the session cookie. Required; internal/config
	// generates a random one at boot if the operator didn't set one.
	CookieSecret string
	// FrontendURL is where a completed login redirects back to. Empty means
	// same-origin ("/").
	FrontendURL string
	// CookieSecure controls the cookie's Secure flag. False only makes sense
	// for local HTTP development; every real deployment needs it true,
	// which is also what SameSite=None requires browsers to accept it at
	// all.
	CookieSecure bool
}

// Service holds everything the /auth/* handlers need.
type Service struct {
	cfg          Config
	oauthConf    *oauth2.Config
	states       *stateStore
	sessions     *websocket.Sessions
	users        UserStore
	limiter      *rateLimiter
	cookieSecret []byte
	userInfoURL  string
}

// googleUserInfoURL is Google's OpenID Connect userinfo endpoint. Using it
// instead of verifying the ID token avoids pulling in a JWT/JWKS library for
// a feature that only needs three fields off it.
const googleUserInfoURL = "https://openidconnect.googleapis.com/v1/userinfo"

// New builds a Service. sessions must be the same *websocket.Sessions the
// Hub resumes connections against — Google sign-in links an existing
// anonymous session rather than owning a second identity store.
func New(cfg Config, sessions *websocket.Sessions, users UserStore) *Service {
	return &Service{
		cfg: cfg,
		oauthConf: &oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			RedirectURL:  cfg.RedirectURL,
			Endpoint:     google.Endpoint,
			Scopes:       []string{"openid", "email", "profile"},
		},
		states:       newStateStore(),
		sessions:     sessions,
		users:        users,
		limiter:      newRateLimiter(10, time.Minute),
		cookieSecret: []byte(cfg.CookieSecret),
		userInfoURL:  googleUserInfoURL,
	}
}
