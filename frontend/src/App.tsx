import React from "react";
import { WebSocketProvider } from "./providers/WebSocketProvider";
import { Chat } from "./components/Chat/Chat";

function App() {
  return (
    <WebSocketProvider>
      <div className="min-h-screen bg-gray-100 py-6">
        <Chat />
      </div>
    </WebSocketProvider>
  );
}

export default App;
