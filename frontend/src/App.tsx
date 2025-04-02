// src/App.tsx
import { WebSocketProvider } from "./providers/WebSocketProvider";
import { Chat } from "./components/Chat/Chat";
import { IsometricGameBoard } from "./components/Game/IsometricGameBoard";
function App() {
  return (
    <WebSocketProvider>
      <div className="grid grid-cols-3 h-screen">
        <div className="col-span-3 h-[80vh] overflow-hidden">
          <IsometricGameBoard />
        </div>
        <div className="h-[20vh] overflow-hidden">
          <Chat />
        </div>
        <div>2</div>
        <div>3</div>
      </div>
    </WebSocketProvider>
  );
}

export default App;
