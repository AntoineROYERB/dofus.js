package game

import (
	"errors"
	"math/rand"
	"regexp"
	"sort"
	"strconv"
	"sync"
	"time"

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
	ErrNoLineOfSight       = errors.New("something is in the way")
	ErrSpellOnCooldown     = errors.New("that spell is still recharging")
	ErrTooManyCasts        = errors.New("that spell cannot be cast again this turn")
	ErrBlocked             = errors.New("that cell is blocked")
	ErrNoRoute             = errors.New("there is no way through to that cell")
)

// MaxLogEntries bounds the combat log carried in every snapshot.
const MaxLogEntries = 40

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
	obstacles  map[types.Position]bool
	log        []types.LogEntry
	// logSeq numbers log entries so a client can recognise the ones it has
	// already played. It is never reset while the game object lives, so a
	// rematch cannot hand out a sequence number twice.
	logSeq int64
	winner string
	rng    *rand.Rand

	turnDuration time.Duration
	turnEndsAt   time.Time
}

// DefaultTurnDuration bounds a turn so an idle or disconnected player cannot
// stall the match indefinitely.
const DefaultTurnDuration = 45 * time.Second

func New() *Game {
	return NewWithOptions(rand.New(rand.NewSource(rand.Int63())), DefaultTurnDuration)
}

// NewWithRand builds a game with a caller-supplied source of randomness, so
// tests can pin initiative and starting cells.
func NewWithRand(rng *rand.Rand) *Game {
	return NewWithOptions(rng, DefaultTurnDuration)
}

func NewWithOptions(rng *rand.Rand, turnDuration time.Duration) *Game {
	if turnDuration <= 0 {
		turnDuration = DefaultTurnDuration
	}
	return &Game{
		status:       types.StatusCreatingPlayer,
		players:      make(map[string]types.Player),
		spells:       Catalogue(),
		rng:          rng,
		turnDuration: turnDuration,
	}
}

// Snapshot returns a deep copy of the state, safe to marshal after the lock is
// released.
func (g *Game) Snapshot() types.GameState {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.snapshotLocked()
}

// SnapshotFor is a viewer-scoped snapshot. While players are still choosing
// where to start, another character's chosen cell is withheld from everyone
// but that character's own owner — otherwise the last player to place would
// always know exactly where the other is standing before the fight even
// starts. Once play begins every position is visible again.
func (g *Game) SnapshotFor(viewerID string) types.GameState {
	g.mu.RLock()
	defer g.mu.RUnlock()
	state := g.snapshotLocked()
	if g.status == types.StatusPositionCharacters {
		for id, p := range state.Players {
			if id == viewerID {
				continue
			}
			p.Character.Position = nil
			state.Players[id] = p
		}
	}
	return state
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
		if c.Effects != nil {
			c.Effects = append([]types.Effect(nil), c.Effects...)
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

	turnEndsAt := int64(0)
	if g.status == types.StatusPlaying && !g.turnEndsAt.IsZero() {
		turnEndsAt = g.turnEndsAt.UnixMilli()
	}

	log := make([]types.LogEntry, len(g.log))
	copy(log, g.log)

	obstacles := make([]types.Position, 0, len(g.obstacles))
	for p := range g.obstacles {
		obstacles = append(obstacles, p)
	}
	sort.Slice(obstacles, func(i, j int) bool {
		if obstacles[i].X != obstacles[j].X {
			return obstacles[i].X < obstacles[j].X
		}
		return obstacles[i].Y < obstacles[j].Y
	})

	return types.GameState{
		MessageType: "game_state",
		Players:     players,
		TurnNumber:  g.turnNumber,
		GameStatus:  g.status,
		Spells:      spells,
		TurnOrder:   turnOrder,
		TurnEndsAt:  turnEndsAt,
		Log:         log,
		Obstacles:   obstacles,
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
		Spells:    g.freshSpellStateLocked(),
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
	g.startPlacementIfReadyLocked()
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
		p.HasPositioned = false
		p.IsCurrentTurn = false
		p.Character.Health = StartingHealth
		p.Character.ActionPoints = StartingActionPoints
		p.Character.MovementPoints = StartingMovementPoints
		p.Character.IsAlive = true
		p.Character.IsCurrentTurn = false
		p.Character.Position = nil
		p.Character.InitialPositions = nil
		p.Character.Effects = nil
		g.players[id] = p
	}
	for id, p := range g.players {
		p.Spells = g.freshSpellStateLocked()
		g.players[id] = p
	}
	g.status = types.StatusCreatingPlayer
	g.turnNumber = 0
	g.turnIdx = 0
	g.turnOrder = nil
	g.winner = ""
	g.turnEndsAt = time.Time{}
	g.log = nil
	g.obstacles = nil

	// A rematch between two players who are both still here goes straight back
	// to choosing cells. Only a room that has dropped below a duel waits, and
	// it waits for an opponent rather than for a button.
	g.startPlacementIfReadyLocked()
}

// freshSpellStateLocked gives a player a clean slate for every spell.
func (g *Game) freshSpellStateLocked() map[string]types.SpellState {
	state := make(map[string]types.SpellState, len(g.spells))
	for id := range g.spells {
		state[id] = types.SpellState{}
	}
	return state
}

// appendLogLocked records one line of combat history, keeping the tail.
func (g *Game) appendLogLocked(entry types.LogEntry) {
	entry.Turn = g.turnNumber
	g.logSeq++
	entry.Seq = g.logSeq
	g.log = append(g.log, entry)
	if len(g.log) > MaxLogEntries {
		g.log = g.log[len(g.log)-MaxLogEntries:]
	}
}

// startTurnForLocked refreshes what a new turn restores: points, the per-turn
// cast counters, and one tick off every cooldown.
// startTurnForLocked resolves everything a turn beginning brings: effects tick
// first (they can kill), then points are set from what is left of the buffs
// and debuffs, then the spell counters roll over. It reports whether the
// character survived its own effects.
func (g *Game) startTurnForLocked(userID string) (alive bool) {
	p, ok := g.players[userID]
	if !ok {
		return false
	}

	damage, healing := tickEffects(&p.Character)
	if damage > 0 {
		g.appendLogLocked(types.LogEntry{
			Actor: p.Character.Name, Kind: types.LogEffect,
			Text: "suffers from its wounds", Damage: damage,
		})
	}
	if healing > 0 {
		g.appendLogLocked(types.LogEntry{
			Actor: p.Character.Name, Kind: types.LogEffect,
			Text: "recovers " + strconv.Itoa(healing) + " health",
		})
	}
	if !p.Character.IsAlive {
		g.players[userID] = p
		g.appendLogLocked(types.LogEntry{
			Actor: p.Character.Name, Kind: types.LogDeath, Text: "is out of the fight",
		})
		return false
	}

	p.Character.ActionPoints, p.Character.MovementPoints = turnPoints(p.Character)

	spells := make(map[string]types.SpellState, len(g.spells))
	for id := range g.spells {
		st := p.Spells[id]
		st.CastsThisTurn = 0
		if st.CooldownLeft > 0 {
			st.CooldownLeft--
		}
		spells[id] = st
	}
	p.Spells = spells
	g.players[userID] = p
	return true
}

// PlayerCount reports how many characters are in the game.
func (g *Game) PlayerCount() int {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return len(g.players)
}

// HumanCount reports how many of the players are real connections. A room
// whose only remaining player is a bot has nobody left in it.
func (g *Game) HumanCount() int {
	g.mu.RLock()
	defer g.mu.RUnlock()

	n := 0
	for _, p := range g.players {
		if !p.IsBot {
			n++
		}
	}
	return n
}

// HasPlayer reports whether a connection owns a character here.
func (g *Game) HasPlayer(userID string) bool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	_, ok := g.players[userID]
	return ok
}

// startPlacementIfReadyLocked opens the placement phase as soon as the room
// holds a full duel. There is no separate "ready" step: a player who has
// joined has said everything there is to say, and the only thing left to
// decide is where to stand. The button that used to say Ready said nothing
// the act of joining had not already said.
func (g *Game) startPlacementIfReadyLocked() {
	if g.status != types.StatusCreatingPlayer || len(g.players) < MinPlayers {
		return
	}
	g.beginPlacementLocked()
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

	// Cover is scattered once the starting cells are known, so nobody is walled
	// in before the match begins.
	reserved := make([]types.Position, 0, len(ids)*InitialPositionChoices)
	for _, id := range ids {
		reserved = append(reserved, g.players[id].Character.InitialPositions...)
	}
	g.obstacles = make(map[types.Position]bool)
	for _, p := range GenerateObstacles(reserved, g.rng) {
		g.obstacles[p] = true
	}

	// Bots take their starting cell immediately; a human never waits on them.
	g.placeBotsLocked()
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
	g.turnEndsAt = time.Now().Add(g.turnDuration)
	if len(g.turnOrder) > 0 {
		g.startTurnForLocked(g.turnOrder[0])
		g.appendLogLocked(types.LogEntry{
			Actor: g.players[g.turnOrder[0]].Character.Name,
			Kind:  types.LogTurn, Text: "starts their turn",
		})
	}
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
	if g.obstacles[to] {
		return ErrBlocked
	}
	if _, taken := g.playerAtLocked(to); taken {
		return ErrOccupied
	}

	// The cost is the length of the walk around whatever is in the way, not the
	// straight-line distance: with cover on the board those are different, and
	// sometimes there is no way through at all.
	path := FindPath(*p.Character.Position, to, g.blocksMovementLocked)
	if path == nil {
		return ErrNoRoute
	}
	if cost := len(path); cost > p.Character.MovementPoints {
		return ErrNotEnoughMP
	} else {
		p.Character.MovementPoints -= cost
	}

	dest := to
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
	key := strconv.Itoa(spellID)
	spell, ok := g.spells[key]
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

	state := caster.Spells[key]
	if state.CooldownLeft > 0 {
		return ErrSpellOnCooldown
	}
	if spell.MaxCastsPerTurn > 0 && state.CastsThisTurn >= spell.MaxCastsPerTurn {
		return ErrTooManyCasts
	}
	if spell.NeedsLineOfSight && !HasLineOfSight(origin, target, g.blocksSightLocked) {
		return ErrNoLineOfSight
	}

	// A critical replaces the damage outright rather than adding to it, which
	// is how the numbers in the catalogue were always written.
	damage, crit := spell.Damage, false
	if spell.CriticalChance > 0 && g.rng.Intn(100) < spell.CriticalChance {
		damage, crit = spell.CriticalDamage, true
	}

	caster.Character.ActionPoints -= spell.APCost
	state.CastsThisTurn++
	state.CooldownLeft = spell.Cooldown
	caster.Spells[key] = state
	g.players[userID] = caster

	hits, dealt, killed := 0, 0, []string{}
	for _, cell := range AffectedPositions(spell, target, origin) {
		id, ok := g.playerAtLocked(cell)
		if !ok {
			continue
		}
		hit := g.players[id]
		if !hit.Character.IsAlive {
			continue
		}

		through := absorb(hit.Character, damage)
		hit.Character.Health -= through
		hits++
		dealt += through
		if hit.Character.Health <= 0 {
			hit.Character.Health = 0
			hit.Character.IsAlive = false
			killed = append(killed, hit.Character.Name)
		}
		if spell.Effect != nil && !spell.Effect.OnSelf && hit.Character.IsAlive {
			applyEffect(&hit.Character, types.Effect{
				Kind:      spell.Effect.Kind,
				Value:     spell.Effect.Value,
				TurnsLeft: spell.Effect.Duration,
				Source:    spell.Name,
			})
		}
		g.players[id] = hit
	}

	if spell.Effect != nil && spell.Effect.OnSelf {
		self := g.players[userID]
		applyEffect(&self.Character, types.Effect{
			Kind:      spell.Effect.Kind,
			Value:     spell.Effect.Value,
			TurnsLeft: spell.Effect.Duration,
			Source:    spell.Name,
		})
		g.players[userID] = self
	}

	castOrigin, castTarget := origin, target
	g.appendLogLocked(types.LogEntry{
		Actor:   caster.Character.Name,
		Kind:    types.LogCast,
		Text:    castSummary(spell.Name, hits, crit),
		Damage:  dealt,
		Crit:    crit,
		SpellID: spell.ID,
		Origin:  &castOrigin,
		Target:  &castTarget,
	})
	for _, name := range killed {
		g.appendLogLocked(types.LogEntry{Actor: name, Kind: types.LogDeath, Text: "is out of the fight"})
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

// blocksSightLocked reports whether a cell stops a line of sight: cover, or a
// living character standing in the way.
func (g *Game) blocksSightLocked(pos types.Position) bool {
	if g.obstacles[pos] {
		return true
	}
	id, ok := g.playerAtLocked(pos)
	return ok && g.players[id].Character.IsAlive
}

// blocksMovementLocked reports whether a cell cannot be walked through.
func (g *Game) blocksMovementLocked(pos types.Position) bool {
	if g.obstacles[pos] {
		return true
	}
	_, taken := g.playerAtLocked(pos)
	return taken
}

func castSummary(spell string, hits int, crit bool) string {
	switch {
	case hits == 0:
		return "cast " + spell + ", hitting nothing"
	case crit:
		return "cast " + spell + " — critical!"
	default:
		return "cast " + spell
	}
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
		if !g.startTurnForLocked(g.turnOrder[idx]) {
			// Its own poison finished it as the turn opened; carry on looking.
			if g.checkGameOverLocked() {
				return
			}
			continue
		}
		g.applyTurnFlagsLocked()
		g.turnEndsAt = time.Now().Add(g.turnDuration)
		g.appendLogLocked(types.LogEntry{
			Actor: p.Character.Name, Kind: types.LogTurn, Text: "starts their turn",
		})
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
		g.appendLogLocked(types.LogEntry{
			Actor: g.players[alive[0]].Character.Name, Kind: types.LogEnd, Text: "wins the fight",
		})
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
