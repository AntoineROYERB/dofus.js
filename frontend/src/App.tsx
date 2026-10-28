import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { WebSocketProvider } from "./providers/WebSocketProvider";
import LandingPage from "./pages/LandingPage";
import LobbyPage from "./pages/LobbyPage";
import GamePage from "./pages/GamePage";
import MatchHistoryPage from "./pages/MatchHistoryPage";
import ExplorePage from "./pages/ExplorePage";
import ReplayPage from "./pages/ReplayPage";
import DreamPage from "./pages/DreamPage";
import DreamLeaderboardPage from "./pages/DreamLeaderboardPage";
import { LanguageProvider } from "./i18n/LanguageProvider";

function App() {
  return (
    <LanguageProvider>
      <WebSocketProvider>
        <Router>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/lobby" element={<LobbyPage />} />
            <Route path="/game" element={<GamePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/matches" element={<MatchHistoryPage />} />
            <Route path="/matches/:id" element={<ReplayPage />} />
            <Route path="/dream" element={<DreamPage />} />
            <Route path="/dreams/leaderboard" element={<DreamLeaderboardPage />} />
          </Routes>
        </Router>
      </WebSocketProvider>
    </LanguageProvider>
  );
}

export default App;
