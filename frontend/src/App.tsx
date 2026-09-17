import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { WebSocketProvider } from "./providers/WebSocketProvider";
import LandingPage from "./pages/LandingPage";
import LobbyPage from "./pages/LobbyPage";
import GamePage from "./pages/GamePage";
import MatchHistoryPage from "./pages/MatchHistoryPage";
import ReplayPage from "./pages/ReplayPage";

function App() {
  return (
    <WebSocketProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/lobby" element={<LobbyPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/matches" element={<MatchHistoryPage />} />
          <Route path="/matches/:id" element={<ReplayPage />} />
        </Routes>
      </Router>
    </WebSocketProvider>
  );
}

export default App;
