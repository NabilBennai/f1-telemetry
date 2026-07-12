import { NavLink, Outlet } from "react-router-dom";

const COLORS = {
  bg: "#0A0B0D",
  panelBorder: "#22262d",
  amber: "#FFB627",
  text: "#E8E9EC",
  muted: "#6B7280",
};

function navLinkStyle({ isActive }) {
  return {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontSize: 13,
    textDecoration: "none",
    color: isActive ? COLORS.amber : COLORS.muted,
    borderBottom: isActive ? `2px solid ${COLORS.amber}` : "2px solid transparent",
    padding: "6px 2px",
  };
}

export default function Layout() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(1200px 600px at 50% -10%, #14181f 0%, ${COLORS.bg} 60%)`,
        color: COLORS.text,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
      `}</style>
      <nav
        style={{
          display: "flex",
          gap: 24,
          padding: "14px 24px",
          borderBottom: `1px solid ${COLORS.panelBorder}`,
        }}
      >
        <NavLink to="/" end style={navLinkStyle}>
          Direct
        </NavLink>
        <NavLink to="/history" style={navLinkStyle}>
          Historique
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
