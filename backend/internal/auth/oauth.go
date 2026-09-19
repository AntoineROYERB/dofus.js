package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"golang.org/x/oauth2"
)

// GoogleUser is the subset of Google's userinfo response this package
// needs. Sub is the only stable identifier: email and name are display
// data, not keys.
type GoogleUser struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

// fetchUserInfo asks Google (or, in tests, a fake standing in for it) who a
// just-exchanged token belongs to. Using the userinfo endpoint instead of
// verifying the ID token's signature avoids a JWKS-fetching, signature
// verification dependency for a feature that only needs three fields.
func (s *Service) fetchUserInfo(ctx context.Context, token *oauth2.Token) (GoogleUser, error) {
	client := s.oauthConf.Client(ctx, token)
	resp, err := client.Get(s.userInfoURL)
	if err != nil {
		return GoogleUser{}, fmt.Errorf("fetch userinfo: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return GoogleUser{}, fmt.Errorf("userinfo: unexpected status %d", resp.StatusCode)
	}

	var user GoogleUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return GoogleUser{}, fmt.Errorf("decode userinfo: %w", err)
	}
	if user.Sub == "" {
		return GoogleUser{}, fmt.Errorf("userinfo: missing sub")
	}
	return user, nil
}
