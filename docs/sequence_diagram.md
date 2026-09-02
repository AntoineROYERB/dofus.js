# How a match travels the wire

The server is the referee: the client asks, the server decides, and the answer
is always a whole `game_state` snapshot rather than a diff. These two diagrams
are the shape of that conversation.

## Connecting, and getting into a room

A connection is an identity. Inbound messages carry no user id at all, so a
client cannot act as another player; a resume token lets a reload come back as
the same character.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant H as handler.go
    participant Hub as hub.go
    participant L as game/lobby.go
    participant G as game/game.go

    B->>H: GET /ws?token=… (WebSocket upgrade)
    H->>Hub: register(client)
    Note over H: readPump and writePump, one goroutine each
    Hub-->>B: user_init { user, token, resumed }
    Hub-->>B: lobby_state { rooms }

    B->>Hub: create_room { name, withBot }
    Hub->>L: Create(name)
    L-->>Hub: room
    Hub-->>B: room_joined { roomId, roomName }
    Hub-->>B: game_state (snapshot)

    B->>Hub: create_character { name, colour }
    Hub->>G: AddPlayer
    Hub-->>B: game_state (broadcast to the room)
```

## A turn

Every rule — whose turn it is, whether a cell is in range, whether a spell is
affordable — is decided in Go. The client draws the snapshot it is given and
never decides anything; when it asks for something illegal it is told so.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant Hub as hub.go
    participant G as game/game.go
    participant Bot as game/bot.go

    B->>Hub: move { position }
    Hub->>G: Move — A* around cover, movement points
    G-->>Hub: ok
    Hub-->>B: game_state (broadcast)

    B->>Hub: cast_spell { spellId, targetPosition }
    Hub->>G: CastSpell — range, line of sight, cooldown, action points
    alt refused
        G-->>Hub: error
        Hub-->>B: action_rejected { action, reason }
    else allowed
        G-->>Hub: damage, critical, status effects, log entries
        Hub-->>B: game_state (broadcast)
    end

    B->>Hub: end_turn
    Hub->>G: EndTurn — next fighter, new deadline
    Hub-->>B: game_state (broadcast)

    Note over Bot: the computer plays on the same clock,<br/>one action per tick, so its turn is watchable
    Bot->>G: Move / CastSpell
    Hub-->>B: game_state (broadcast)

    Note over Hub: a turn that runs out of time is passed on<br/>by the same path, with nobody asking
```
