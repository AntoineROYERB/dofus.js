// import { createContext, useState, useCallback, useEffect } from "react";
// import { GameAction, GameState } from "../types/message";
// import { useWebSocket } from "./WebSocketContext";

// interface GameContextType {
//   gameState: GameState | null;
//   dispatchGameAction: (action: GameAction) => void;
// }

// export const GameContext = createContext<GameContextType | null>(null);

// export const GameProvider: React.FC = ({ children }) => {
//   const [gameState, setGameState] = useState<GameState | null>(null);
//   const { socket } = useWebSocket();

//   const dispatchGameAction = useCallback(
//     (action: GameAction) => {
//       if (socket?.readyState === WebSocket.OPEN) {
//         socket.send(
//           JSON.stringify({
//             type: "game_action",
//             payload: action,
//           })
//         );
//       }
//     },
//     [socket]
//   );

//   useEffect(() => {
//     if (!socket) return;

//     socket.addEventListener("message", (event) => {
//       const message = JSON.parse(event.data);
//       if (message.type === "game_state_update") {
//         setGameState(message.payload);
//       }
//     });
//   }, [socket]);

//   return (
//     <GameContext.Provider value={{ gameState, dispatchGameAction }}>
//       {children}
//     </GameContext.Provider>
//   );
// };
