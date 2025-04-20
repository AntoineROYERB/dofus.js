// src/App.tsx
import { WebSocketProvider } from "./providers/WebSocketProvider";
import { Chat } from "./components/Chat/Chat";
import { GameBoard } from "./components/Game/GameBoard";
import SpellBar from "./components/Game/Spellbar";
function App() {
  return (
    <WebSocketProvider>
      <div className="grid grid-cols-3 h-screen">
        <div className="col-span-3 h-[80vh] overflow-hidden">
          <GameBoard />
        </div>
        <div className="h-[20vh] overflow-hidden">
          <Chat />
        </div>
        <div className="h-[20vh] overflow-hidden">
          <SpellBar />
        </div>
        <div>3</div>
      </div>
    </WebSocketProvider>
  );
}

export default App;
