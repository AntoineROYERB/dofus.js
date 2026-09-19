package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"
)

// sessionCookieName is deliberately namespaced: this cookie carries an
// existing websocket resume token, not a new identity of its own, so it is
// named after what it is (a session pointer) rather than "token", which the
// frontend already uses for the WS query string value in localStorage.
const sessionCookieName = "dofusjs_session"

// cookieMaxAge is a product choice, not a technical constraint: 30 days
// means a returning player stays signed in across a typical play session
// without lingering forever if the browser is shared.
const cookieMaxAge = 30 * 24 * time.Hour

// signToken produces "<token>.<hmac>" so a client cannot forge a cookie
// naming another browser's resume token — anonymous sessions are otherwise
// only ever presented over a WebSocket's ?token= query string, which an
// attacker would first have to already know.
func signToken(token string, secret []byte) string {
	return token + "." + hex.EncodeToString(sign(token, secret))
}

// verifyCookie checks a cookie value produced by signToken and returns the
// resume token it names.
func verifyCookie(raw string, secret []byte) (token string, ok bool) {
	i := strings.LastIndex(raw, ".")
	if i <= 0 || i == len(raw)-1 {
		return "", false
	}
	token, sigHex := raw[:i], raw[i+1:]
	sig, err := hex.DecodeString(sigHex)
	if err != nil {
		return "", false
	}
	if !hmac.Equal(sig, sign(token, secret)) {
		return "", false
	}
	return token, true
}

func sign(token string, secret []byte) []byte {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(token))
	return mac.Sum(nil)
}

func setSessionCookie(w http.ResponseWriter, token string, secret []byte, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    signToken(token, secret),
		Path:     "/",
		MaxAge:   int(cookieMaxAge.Seconds()),
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite(secure),
	})
}

func clearSessionCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite(secure),
	})
}

// sameSite is None (cross-site) whenever the cookie is Secure, since the
// deployed frontend and backend are different sites; a plain-HTTP local
// dev server can't set SameSite=None at all (browsers require Secure with
// it), so it falls back to Lax, which is enough for same-origin/localhost
// testing.
func sameSite(secure bool) http.SameSite {
	if secure {
		return http.SameSiteNoneMode
	}
	return http.SameSiteLaxMode
}

func readSessionCookie(r *http.Request, secret []byte) (token string, ok bool) {
	c, err := r.Cookie(sessionCookieName)
	if err != nil {
		return "", false
	}
	return verifyCookie(c.Value, secret)
}
