import { Link } from 'react-router-dom';

function Navbar() {
  const navStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    backgroundColor: '#002147', // 야구장 느낌의 짙은 네이비
    color: 'white'
  };

  const linkStyle = {
    color: 'white',
    textDecoration: 'none',
    marginLeft: '20px',
    fontWeight: 'bold'
  };

  return (
    <nav style={navStyle}>
      <h1 style={{ margin: 0 }}>⚾ AUBL</h1>
      <div>
        <Link to="/" style={linkStyle}>홈</Link>
        <Link to="/league" style={linkStyle}>리그소개</Link>
        <Link to="/group" style={linkStyle}>조별현황</Link>
        <Link to="/team" style={linkStyle}>팀소개</Link>
        <Link to="/progress" style={linkStyle}>진행상황</Link>
        <Link to="/prediction" style={linkStyle}>승부예측</Link>
      </div>
    </nav>
  );
}

export default Navbar;