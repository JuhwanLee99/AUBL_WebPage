import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import LeagueInfo from './pages/LeagueInfo';
import GroupInfo from './pages/GroupInfo';
import TeamInfo from './pages/TeamInfo';
import Progress from './pages/Progress';
import Prediction from './pages/Prediction';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <main className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/league" element={<LeagueInfo />} />
            <Route path="/group" element={<GroupInfo />} />
            <Route path="/team" element={<TeamInfo />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/prediction" element={<Prediction />} />
          </Routes>
        </main>
        <footer style={{ textAlign: 'center', padding: '20px', background: '#f1f1f1', marginTop: '20px' }}>
          <p>© 2024 AUBL (Amateur University Baseball League). All rights reserved.</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;