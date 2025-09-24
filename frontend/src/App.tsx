import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { WebSocketProvider } from "./providers/WebSocketProvider";
import LandingPage from "./pages/LandingPage";
import GamePage from "./pages/GamePage";

function App() {
  return (
    <WebSocketProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/game" element={<GamePage />} />
        </Routes>
      </Router>
    </WebSocketProvider>
  );
}

export default App;
