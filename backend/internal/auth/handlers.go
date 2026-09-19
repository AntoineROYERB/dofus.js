package auth

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"game-server/internal/websocket"

	"golang.org/x/oauth2"
)

const defaultPageLimit = 20

var errTooManyRequests = errors.New("too many requests")

// RegisterRoutes wires the Google sign-in endpoints onto mux:
//
//	GET  /auth/google/login     start a login, optionally linking an
//	                            existing anonymous resume token (?token=)
//	GET  /auth/google/callback  Google redirects here with the result
//	POST /auth/logout           unlink the account from this browser's
//	                            session; anonymous play continues
//	GET  /auth/session          who, if anyone, this browser is signed in as
//	GET  /auth/matches          the signed-in account's match history
//
// originAllowed decides which Origin header values may receive
// Access-Control-Allow-Credentials — every response here can carry the
// session cookie, so unlike the public /api/matches endpoints it must never
// echo "*".
func RegisterRoutes(mux *http.ServeMux, svc *Service, originAllowed func(origin string) bool) {
	// Go's ServeMux dispatches by method+path, so a route only registered as
	// "POST /path" answers a browser's OPTIONS preflight with 405 before
	// authCORS ever runs. Registering the same wrapped handler under
	// "OPTIONS /path" too lets authCORS's own preflight branch take it —
	// the underlying handler is never invoked for OPTIONS either way.
	register := func(method, path string, h http.HandlerFunc) {
		wrapped := authCORS(originAllowed, h)
		mux.Handle(method+" "+path, wrapped)
		mux.Handle("OPTIONS "+path, wrapped)
	}

	register("GET", "/auth/google/login", rateLimited(svc.limiter, svc.handleLogin))
	register("GET", "/auth/google/callback", rateLimited(svc.limiter, svc.handleCallback))
	register("POST", "/auth/logout", svc.handleLogout)
	register("GET", "/auth/session", svc.handleSession)
	register("GET", "/auth/matches", svc.handleMatches)
}

func (s *Service) handleLogin(w http.ResponseWriter, r *http.Request) {
	anonymousToken := r.URL.Query().Get("token")
	state, verifier, err := s.states.Create(anonymousToken)
	if err != nil {
		slog.Error("failed to start login", "component", "auth", "error", err)
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	url := s.oauthConf.AuthCodeURL(state, oauth2.AccessTypeOnline, oauth2.S256ChallengeOption(verifier))
	http.Redirect(w, r, url, http.StatusFound)
}

func (s *Service) handleCallback(w http.ResponseWriter, r *http.Request) {
	entry, ok := s.states.Consume(r.URL.Query().Get("state"))
	if !ok {
		writeError(w, http.StatusBadRequest, errors.New("unknown or expired login attempt"))
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		writeError(w, http.StatusBadRequest, errors.New("missing code"))
		return
	}

	ctx := r.Context()
	token, err := s.oauthConf.Exchange(ctx, code, oauth2.VerifierOption(entry.Verifier))
	if err != nil {
		slog.Error("token exchange failed", "component", "auth", "error", err)
		writeError(w, http.StatusBadGateway, errors.New("google sign-in failed"))
		return
	}

	guser, err := s.fetchUserInfo(ctx, token)
	if err != nil {
		slog.Error("fetching google userinfo failed", "component", "auth", "error", err)
		writeError(w, http.StatusBadGateway, errors.New("google sign-in failed"))
		return
	}

	user, err := s.users.UpsertUser(ctx, guser.Sub, guser.Email, guser.Name)
	if err != nil {
		slog.Error("upsert user failed", "component", "auth", "error", err)
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	sess, resumed := s.sessions.Resume(entry.AnonymousToken)
	if !resumed {
		sess, err = s.sessions.Create()
		if err != nil {
			slog.Error("failed to create session for new sign-in", "component", "auth", "error", err)
			writeError(w, http.StatusInternalServerError, err)
			return
		}
	}
	accountID := user.ID
	s.sessions.SetAccountID(sess.Token, &accountID)

	if err := s.users.ClaimMatches(ctx, user.ID, sess.UserID); err != nil {
		// Claiming is additive and can be retried on the next sign-in; it
		// must not turn a working login into a failed one.
		slog.Error("claiming matches failed", "component", "auth", "user_id", user.ID, "error", err)
	}

	setSessionCookie(w, sess.Token, s.cookieSecret, s.cfg.CookieSecure)
	slog.Info("signed in with google", "component", "auth", "user_id", user.ID)
	http.Redirect(w, r, s.redirectTarget("/profile"), http.StatusFound)
}

func (s *Service) handleLogout(w http.ResponseWriter, r *http.Request) {
	if token, ok := readSessionCookie(r, s.cookieSecret); ok {
		s.sessions.SetAccountID(token, nil)
	}
	clearSessionCookie(w, s.cfg.CookieSecure)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) handleSession(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.resolveAccountSession(r)
	if !ok {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	user, err := s.users.GetUser(r.Context(), *sess.AccountID)
	if err != nil {
		slog.Error("failed to load signed-in user", "component", "auth", "error", err)
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, sessionResponse{ID: user.ID, Email: user.Email, DisplayName: user.DisplayName})
}

func (s *Service) handleMatches(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.resolveAccountSession(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, errors.New("not signed in"))
		return
	}

	limit := defaultPageLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			limit = n
		}
	}
	page, err := s.users.MatchesForUser(r.Context(), *sess.AccountID, limit, r.URL.Query().Get("cursor"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, page)
}

type sessionResponse struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
}

// resolveAccountSession is what every account-gated handler starts with:
// a verified cookie naming a session that is actually linked to an account.
func (s *Service) resolveAccountSession(r *http.Request) (*websocket.Session, bool) {
	token, ok := readSessionCookie(r, s.cookieSecret)
	if !ok {
		return nil, false
	}
	sess, resumed := s.sessions.Resume(token)
	if !resumed || sess.AccountID == nil {
		return nil, false
	}
	return sess, true
}

func (s *Service) redirectTarget(path string) string {
	if s.cfg.FrontendURL == "" {
		return path
	}
	return strings.TrimRight(s.cfg.FrontendURL, "/") + path
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

// authCORS answers preflight requests and, unlike the server's default CORS
// policy for public GET endpoints, adds Access-Control-Allow-Credentials —
// every handler in this package can read or set the session cookie, so the
// browser will only expose the response to script if this header is
// present and the origin is echoed exactly (never "*", which credentialed
// requests reject outright).
func authCORS(originAllowed func(string) bool, next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && originAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	})
}
