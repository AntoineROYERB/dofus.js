package game

import (
	"errors"
	"math/rand"
	"regexp"
	"sort"
	"strconv"
	"sync"

	"game-server/internal/types"
)

// Rejection reasons. They are returned to the offending client verbatim, so
// they are written for a player to read rather than for a log to grep.
var (
	ErrNoCharacter         = errors.New("you have not created a character yet")
	ErrAlreadyHasCharacter = errors.New("you already have a character")
	ErrGameInProgress      = errors.New("a game is already in progress")
	ErrWrongPhase          = errors.New("that action is not available right now")
	ErrNotYourTurn         = errors.New("it is not your turn")
	ErrDead                = errors.New("your character is dead")
	ErrInvalidName         = errors.New("name must be 3 to 20 letters, digits or spaces")
	ErrOffGrid             = errors.New("that cell is outside the board")
	ErrOccupied            = errors.New("that cell is already occupied")
	ErrSameCell            = errors.New("you are already standing there")
	ErrOutOfRange          = errors.New("that cell is out of range")
	ErrNotEnoughMP         = errors.New("not enough movement points")
	ErrNotEnoughAP         = errors.New("not enough action points")
	ErrUnknownSpell        = errors.New("unknown spell")
	ErrNotAStartingCell    = errors.New("that is not one of your starting cells")
	ErrStartingCellTaken   = errors.New("another player already took that starting cell")
	ErrAlreadyPositioned   = errors.New("you have already chosen a starting cell")
)

var namePattern = regexp.MustCompile(`^[a-zA-Z0-9 ]{3,20}$`)

// Game holds the whole authoritative state behind a single lock. It replaces
// the old PlayerManager/GameManager pair, which described the same players in
// two maps guarded by two different mutexes and only stayed consistent because
// they happened to share *Character pointers.
type Game struct {
	mu sync.RWMutex

	status     string
	turnNumber int
	players    map[string]types.Player
	turnOrder  []string // initiative, fixed for the whole game
	turnIdx    int      // index into turnOrder of the player currently acting
	spells     map[string]types.Spell
	winner     string
	rng        *rand.Rand
}

func New() *Game {
	return NewWithRand(rand.New(rand.NewSource(rand.Int63())))
}

// NewWithRand builds a game with a caller-supplied source of randomness, so
// tests can pin initiative and starting cells.
func NewWithRand(rng *rand.Rand) *Game {
	return &Game{
		status:  types.StatusCreatingPlayer,
		players: make(map[string]types.Player),
		spells:  Catalogue(),
		rng:     rng,
	}
}

// Snapshot returns a deep copy of the state, safe to marshal after the lock is
// released.
func (g *Game) Snapshot() types.GameState {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.snapshotLocked()
}

func (g *Game) snapshotLocked() types.GameState {
	players := make(map[string]types.Player, len(g.players))
	for id, p := range g.players {
		c := p.Character
		if c.Position != nil {
			pos := *c.Position
			c.Position = &pos
		}
		if c.InitialPositions != nil {
			c.InitialPositions = append([]types.Position(nil), c.InitialPositions...)
		}
		p.Character = c
		players[id] = p
	}

	spells := make(map[string]types.Spell, len(g.spells))
	for k, v := range g.spells {
		spells[k] = v
	}

	// Always an array, never null: a nil slice marshals to JSON null and makes
	// every client guard against it.
	turnOrder := make([]string, len(g.turnOrder))
	copy(turnOrder, g.turnOrder)

	return types.GameState{
		MessageType: "game_state",
		Players:     players,
		TurnNumber:  g.turnNumber,
		GameStatus:  g.status,
		Spells:      spells,
		TurnOrder:   turnOrder,
	}
}

func (g *Game) Status() string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.status
}

// Winner returns the winning player's name once the game is over.
func (g *Game) Winner() (string, bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.winner, g.status == types.StatusGameOver
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

// AddPlayer registers a character for a connection. Every stat is set here:
// the client only chooses a name, a colour and a symbol.
func (g *Game) AddPlayer(userID, userName string, look types.CharacterAppearance) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.status != types.StatusCreatingPlayer {
		return ErrGameInProgress
	}
	if _, exists := g.players[userID]; exists {
		return ErrAlreadyHasCharacter
	}
	if !namePattern.MatchString(look.Name) {
		return ErrInvalidName
	}

	symbol := look.Symbol
	if symbol == "" {
		symbol = look.Name[:1]
	}

	g.players[userID] = types.Player{
		UserID:    userID,
		UserName:  userName,
		Connected: true,
		Character: types.Character{
			Name:           look.Name,
			Color:          look.Color,
			Symbol:         symbol,
			ActionPoints:   StartingActionPoints,
			MovementPoints: StartingMovementPoints,
			Health:         StartingHealth,
			MaxHealth:      StartingHealth,
			IsAlive:        true,
		},
	}
	return nil
}

// RemovePlayer takes a player out for good. Mid-game this is a forfeit, so
// play has to move on: the turn advances if it was theirs, and the game ends
// if only one character is left standing.
func (g *Game) RemovePlayer(userID string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if _, ok := g.players[userID]; !ok {
		return
	}
	wasActing := g.status == types.StatusPlaying &&
		g.turnIdx < len(g.turnOrder) && g.turnOrder[g.turnIdx] == userID

	delete(g.players, userID)
	g.turnOrder = removeString(g.turnOrder, userID)
	if g.turnIdx >= len(g.turnOrder) {
		g.turnIdx = 0
	}

	switch g.status {
	case types.StatusPlaying:
		if g.checkGameOverLocked() {
			return
		}
		if wasActing {
			// turnIdx now points at whoever took the leaver's slot, so start
			// the search one step back to land on them rather than skip them.
			g.turnIdx = (g.turnIdx - 1 + len(g.turnOrder)) % len(g.turnOrder)
			g.advanceTurnLocked()
		} else {
			g.applyTurnFlagsLocked()
		}
	case types.StatusPositionCharacters:
		if len(g.players) < MinPlayers {
			g.returnToLobbyLocked()
			return
		}
		for _, p := range g.players {
			if !p.HasPositioned {
				return
			}
		}
		g.beginPlayLocked()
	}
}

// SetConnected flags a player as present or away without touching their
// character.
func (g *Game) SetConnected(userID string, connected bool) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if p, ok := g.players[userID]; ok {
		p.Connected = connected
		g.players[userID] = p
	}
}

// Restart sets up a rematch between the same players, keeping the characters
// they created. The client used to "play again" by reloading the page, which
// did nothing at all to the server.
func (g *Game) Restart() error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.status != types.StatusGameOver {
		return ErrWrongPhase
	}
	g.returnToLobbyLocked()
	return nil
}

func (g *Game) returnToLobbyLocked() {
	for id, p := range g.players {
		p.IsReady = false
		p.HasPositioned = false
		p.IsCurrentTurn = false
		p.Character.Health = StartingHealth
		p.Character.ActionPoints = StartingActionPoints
		p.Character.MovementPoints = StartingMovementPoints
		p.Character.IsAlive = true
		p.Character.IsCurrentTurn = false
		p.Character.Position = nil
		p.Character.InitialPositions = nil
		g.players[id] = p
	}
	g.status = types.StatusCreatingPlayer
	g.turnNumber = 0
	g.turnIdx = 0
	g.turnOrder = nil
	g.winner = ""
}

// PlayerCount reports how many characters are in the game.
func (g *Game) PlayerCount() int {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return len(g.players)
}

// HasPlayer reports whether a connection owns a character here.
func (g *Game) HasPlayer(userID string) bool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	_, ok := g.players[userID]
	return ok
}

// SetReady marks a player ready and starts the placement phase once everyone
// is ready and there are enough players.
func (g *Game) SetReady(userID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.status != types.StatusCreatingPlayer {
		return ErrWrongPhase
	}
	p, ok := g.players[userID]
	if !ok {
		return ErrNoCharacter
	}
	p.IsReady = true
	g.players[userID] = p

	if len(g.players) < MinPlayers {
		return nil
	}
	for _, other := range g.players {
		if !other.IsReady {
			return nil
		}
	}
	g.beginPlacementLocked()
	return nil
}

func (g *Game) beginPlacementLocked() {
	ids := g.sortedPlayerIDsLocked()

	// Initiative is rolled once and then fixed. It used to be re-derived from
	// Go map iteration order on every turn, which reshuffled it each time.
	g.rng.Shuffle(len(ids), func(i, j int) { ids[i], ids[j] = ids[j], ids[i] })
	g.turnOrder = ids

	for id, positions := range DealInitialPositions(ids, g.rng) {
		p := g.players[id]
		p.Character.InitialPositions = positions
		g.players[id] = p
	}

	g.status = types.StatusPositionCharacters
}

// ChooseInitialPosition places a character on one of the cells it was offered.
func (g *Game) ChooseInitialPosition(userID string, pos types.Position) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.status != types.StatusPositionCharacters {
		return ErrWrongPhase
	}
	p, ok := g.players[userID]
	if !ok {
		return ErrNoCharacter
	}
	if p.HasPositioned {
		return ErrAlreadyPositioned
	}
	if !containsPosition(p.Character.InitialPositions, pos) {
		return ErrNotAStartingCell
	}
	if id, taken := g.playerAtLocked(pos); taken && id != userID {
		return ErrStartingCellTaken
	}

	placed := pos
	p.Character.Position = &placed
	p.HasPositioned = true
	g.players[userID] = p

	for _, other := range g.players {
		if !other.HasPositioned {
			return nil
		}
	}
	g.beginPlayLocked()
	return nil
}

func (g *Game) beginPlayLocked() {
	g.status = types.StatusPlaying
	g.turnNumber = 1
	g.turnIdx = 0
	g.applyTurnFlagsLocked()
}

// ---------------------------------------------------------------------------
// Play
// ---------------------------------------------------------------------------

// Move walks a character to a cell, charging movement points for the distance.
func (g *Game) Move(userID string, to types.Position) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	p, err := g.requireActingPlayerLocked(userID)
	if err != nil {
		return err
	}
	if !InGrid(to) {
		return ErrOffGrid
	}
	if *p.Character.Position == to {
		return ErrSameCell
	}
	if _, taken := g.playerAtLocked(to); taken {
		return ErrOccupied
	}

	cost := Distance(*p.Character.Position, to)
	if cost > p.Character.MovementPoints {
		return ErrNotEnoughMP
	}

	dest := to
	p.Character.MovementPoints -= cost
	p.Character.Position = &dest
	g.players[userID] = p
	return nil
}

// CastSpell charges action points and applies damage to every living
// character standing in the resulting area.
func (g *Game) CastSpell(userID string, spellID int, target types.Position) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	caster, err := g.requireActingPlayerLocked(userID)
	if err != nil {
		return err
	}
	spell, ok := g.spells[strconv.Itoa(spellID)]
	if !ok {
		return ErrUnknownSpell
	}
	if !InGrid(target) {
		return ErrOffGrid
	}
	origin := *caster.Character.Position
	if Distance(origin, target) > spell.Range {
		return ErrOutOfRange
	}
	if caster.Character.ActionPoints < spell.APCost {
		return ErrNotEnoughAP
	}

	caster.Character.ActionPoints -= spell.APCost
	g.players[userID] = caster

	for _, cell := range AffectedPositions(spell, target, origin) {
		id, ok := g.playerAtLocked(cell)
		if !ok {
			continue
		}
		hit := g.players[id]
		if !hit.Character.IsAlive {
			continue
		}
		hit.Character.Health -= spell.Damage
		if hit.Character.Health <= 0 {
			hit.Character.Health = 0
			hit.Character.IsAlive = false
		}
		g.players[id] = hit
	}

	if g.checkGameOverLocked() {
		return nil
	}
	// A caster who killed themselves in their own blast cannot end their turn,
	// so move play along rather than deadlocking the game.
	if !g.players[userID].Character.IsAlive {
		g.advanceTurnLocked()
	}
	return nil
}

// EndTurn hands play to the next living character in initiative order.
func (g *Game) EndTurn(userID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if _, err := g.requireActingPlayerLocked(userID); err != nil {
		return err
	}
	g.advanceTurnLocked()
	return nil
}

func (g *Game) advanceTurnLocked() {
	n := len(g.turnOrder)
	if n == 0 {
		return
	}

	for step := 1; step <= n; step++ {
		idx := (g.turnIdx + step) % n
		// Passing index 0 means initiative wrapped around: a full round elapsed,
		// whether or not the player at that index is the one who ends up acting.
		if idx == 0 {
			g.turnNumber++
		}
		p, ok := g.players[g.turnOrder[idx]]
		if !ok || !p.Character.IsAlive {
			continue
		}
		g.turnIdx = idx
		p.Character.ActionPoints = StartingActionPoints
		p.Character.MovementPoints = StartingMovementPoints
		g.players[g.turnOrder[idx]] = p
		g.applyTurnFlagsLocked()
		return
	}
	g.checkGameOverLocked()
}

// applyTurnFlagsLocked rewrites the turn flags from scratch. The old code set
// the incoming player's flag but never cleared the outgoing one, so characters
// accumulated isCurrentTurn=true over the course of a game.
func (g *Game) applyTurnFlagsLocked() {
	current := ""
	if g.turnIdx < len(g.turnOrder) {
		current = g.turnOrder[g.turnIdx]
	}
	for id, p := range g.players {
		isCurrent := id == current
		p.IsCurrentTurn = isCurrent
		p.Character.IsCurrentTurn = isCurrent
		g.players[id] = p
	}
}

func (g *Game) checkGameOverLocked() bool {
	if g.status != types.StatusPlaying {
		return g.status == types.StatusGameOver
	}

	alive := make([]string, 0, len(g.players))
	for id, p := range g.players {
		if p.Character.IsAlive {
			alive = append(alive, id)
		}
	}
	if len(alive) > 1 {
		return false
	}

	g.status = types.StatusGameOver
	if len(alive) == 1 {
		g.winner = g.players[alive[0]].UserName
	}
	for id, p := range g.players {
		p.IsCurrentTurn = false
		p.Character.IsCurrentTurn = false
		g.players[id] = p
	}
	return true
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// requireActingPlayerLocked is the single gate every in-play action goes
// through: the game must be running, the caller must own a living, placed
// character, and it must be their turn.
func (g *Game) requireActingPlayerLocked(userID string) (types.Player, error) {
	if g.status != types.StatusPlaying {
		return types.Player{}, ErrWrongPhase
	}
	p, ok := g.players[userID]
	if !ok {
		return types.Player{}, ErrNoCharacter
	}
	if !p.Character.IsAlive {
		return types.Player{}, ErrDead
	}
	if g.turnIdx >= len(g.turnOrder) || g.turnOrder[g.turnIdx] != userID {
		return types.Player{}, ErrNotYourTurn
	}
	if p.Character.Position == nil {
		return types.Player{}, ErrWrongPhase
	}
	return p, nil
}

func (g *Game) playerAtLocked(pos types.Position) (string, bool) {
	for id, p := range g.players {
		if p.Character.Position != nil && *p.Character.Position == pos {
			return id, true
		}
	}
	return "", false
}

func (g *Game) sortedPlayerIDsLocked() []string {
	ids := make([]string, 0, len(g.players))
	for id := range g.players {
		ids = append(ids, id)
	}
	// Sorted before shuffling so initiative depends only on the injected
	// random source, not on Go's map iteration order.
	sort.Strings(ids)
	return ids
}

func removeString(list []string, want string) []string {
	out := list[:0]
	for _, s := range list {
		if s != want {
			out = append(out, s)
		}
	}
	return out
}

func containsPosition(list []types.Position, p types.Position) bool {
	for _, candidate := range list {
		if candidate == p {
			return true
		}
	}
	return false
}
