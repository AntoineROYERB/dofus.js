package types

import (
	"reflect"
	"strings"
	"testing"
)

// TestInboundMessagesNeverCarryIdentity locks in the invariant documented on
// BaseMessage: a client cannot claim an identity, because no inbound
// message type has a field for one. This is what makes Google sign-in
// (internal/auth) safe to add — an account id is resolved from a signed
// HTTP cookie or a server-side session lookup, never from a message a
// client sent, and this test is what would break if a future change ever
// added a userId/accountId field to one of these types.
func TestInboundMessagesNeverCarryIdentity(t *testing.T) {
	inbound := []any{
		ChatMessageIn{},
		CreateCharacterIn{},
		CharacterPositionedIn{},
		MoveIn{},
		EndTurnIn{},
		CastSpellIn{},
		CreateRoomIn{},
		JoinRoomIn{},
		LeaveRoomIn{},
		PlayAgainIn{},
		DisconnectIn{},
	}

	forbidden := []string{"userid", "username", "accountid"}

	for _, msg := range inbound {
		walkFields(t, reflect.TypeOf(msg), forbidden)
	}
}

func walkFields(t *testing.T, typ reflect.Type, forbidden []string) {
	t.Helper()
	for i := 0; i < typ.NumField(); i++ {
		field := typ.Field(i)
		if field.Anonymous && field.Type.Kind() == reflect.Struct {
			walkFields(t, field.Type, forbidden)
			continue
		}
		jsonTag := strings.Split(field.Tag.Get("json"), ",")[0]
		name := strings.ToLower(jsonTag)
		if name == "" {
			name = strings.ToLower(field.Name)
		}
		for _, f := range forbidden {
			if name == f {
				t.Fatalf("%s.%s carries identity (json tag %q); inbound messages must never let a client claim who they are",
					typ.Name(), field.Name, jsonTag)
			}
		}
	}
}
