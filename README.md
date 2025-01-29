# Real-Time WebSocket Chat Application

A real-time chat application built with Go backend and React TypeScript frontend, using WebSocket protocol for communication.

## Features

- Real-time messaging
- Multiple client support
- Connection status indicators
- Modern UI with Tailwind CSS
- Message broadcasting

## Project Structure

```
project/
├── backend/
│   ├── cmd/
│   │   └── server/
│   │       └── main.go
│   └── internal/
│       ├── models/
│       │   └── message.go
│       └── websocket/
│           ├── client.go
│           ├── hub.go
│           └── handler.go
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── providers/
    │   ├── context/
    │   └── types/
    ├── tailwind.config.js
    └── package.json
```

## Prerequisites

- Go 1.21 or higher
- Node.js 18 or higher
- npm 9 or higher

## Installation

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Initialize Go module:
```bash
go mod init game-server
```

3. Install required dependencies:
```bash
go get github.com/gorilla/websocket
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Install and configure Tailwind CSS:
```bash
npm install -D tailwindcss@3.4.1 postcss@8.4.35 autoprefixer@10.4.17
```

## Running the Application

1. Start the backend server:
```bash
cd backend
go run cmd/server/main.go
```

2. In a new terminal, start the frontend development server:
```bash
cd frontend
npm run dev
```

3. Open your browser and navigate to:
```
http://localhost:5173
```

## Environment Variables

### Backend
- Default port: 8080

### Frontend
- Default WebSocket URL: ws://localhost:8080/ws
- Development server port: 5173

## Architecture

### Backend Components

#### Hub
- Manages active WebSocket connections
- Handles message broadcasting
- Tracks connected clients

#### Client
- Represents a connected user
- Manages individual WebSocket connections
- Handles message reading and writing

### Frontend Components

#### WebSocketProvider
- Manages WebSocket connection
- Handles message state
- Provides WebSocket context to components

#### Chat Components
- ChatWindow: Displays messages
- ChatInput: Message input interface
- ConnectionStatus: Shows connection state

## API

### WebSocket Messages Format

```typescript
interface Message {
    type: string;    // Message type (e.g., 'chat')
    sender: string;  // Sender identifier
    content: string; // Message content
}
```

## Development

### Backend Development

Add new features by:
1. Defining new message types in `models/message.go`
2. Implementing handlers in `websocket/hub.go`
3. Updating client handling if needed

### Frontend Development

Extend functionality by:
1. Adding components in `src/components/`
2. Updating WebSocket provider as needed
3. Adding new types in `src/types/`

## Testing

1. Open multiple browser tabs to test multi-user functionality
2. Check browser console (F12) for connection and message logs
3. Monitor backend terminal for server-side logs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push to the branch
5. Create a Pull Request

## Known Issues

- No message persistence
- Messages are lost on page refresh
- Basic error handling

## Future Improvements

- Add message persistence
- Implement user authentication
- Add typing indicators
- Add read receipts
- Support private messaging
- Add a CHANGLOG.md file
- Implement unit tests
- Add Docker support

## Acknowledgments

- [Gorilla WebSocket](https://github.com/gorilla/websocket)
- [React](https://reactjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
