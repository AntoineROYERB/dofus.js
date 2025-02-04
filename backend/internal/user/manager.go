// internal/user/manager.go
package user

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
)

type User struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type UserManager struct {
	users map[string]*User
	mutex sync.RWMutex
}

// NewUserManager creates a new user manager instance
func NewUserManager() *UserManager {
	return &UserManager{
		users: make(map[string]*User),
	}
}

// CreateGuestUser creates a temporary user with a unique ID and name
func (um *UserManager) CreateGuestUser() *User {
	um.mutex.Lock()
	defer um.mutex.Unlock()

	// Generate unique ID
	id := um.generateUniqueID()

	// Create new user
	user := &User{
		ID:   id,
		Name: "Guest-" + id[len(id)-6:], // Use last 6 chars of ID for readable name
	}

	// Store user in manager
	um.users[user.ID] = user

	return user
}

// generateUniqueID creates a random, unique identifier
func (um *UserManager) generateUniqueID() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// GetUser retrieves a user by ID
func (um *UserManager) GetUser(id string) *User {
	um.mutex.RLock()
	defer um.mutex.RUnlock()
	return um.users[id]
}

// RemoveUser removes a user from the manager
func (um *UserManager) RemoveUser(id string) {
	um.mutex.Lock()
	defer um.mutex.Unlock()
	delete(um.users, id)
}
