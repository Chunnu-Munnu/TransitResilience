import Header from "../shared/Header";
import Notification from "../shared/Notification";
import ThemeToggle from "../shared/ThemeToggle";
import HeaderSearch from "../shared/HeaderSearch";
import UserNav from "../user/UserNav";
import { formatClock, useSimulation } from "../../hooks/useSimulation";
import { useTheme } from "../../state/themeStore.jsx";

export default function UserLayout({ left, map, right, connectionStatus, onLogout, activeTab = "my_trip", onTabChange, onSearchTrain }) {
  const { clockMin } = useSimulation();
  const { isDark, setIsDark } = useTheme();

  return (
    <div className={`app-shell ${isDark ? "dark" : "light"}`}>
      <Header
        variant={isDark ? "dark" : "light"}
        tagline="Safer Journeys. Stronger Tomorrow."
        nav={<UserNav activeTab={activeTab} onTabChange={onTabChange} />}
        right={
          <>
            {onSearchTrain && <HeaderSearch onSelectTrain={onSearchTrain} />}
            <ThemeToggle isDark={isDark} onToggle={setIsDark} />
            <span className="clock mono">{formatClock(clockMin)}</span>
            {onLogout && (
              <button
                className={`operator-tag ${isDark ? "" : "light"}`}
                style={{ cursor: "pointer" }}
                onClick={onLogout}
              >
                Log out
              </button>
            )}
          </>
        }
      />
      <Notification connectionStatus={connectionStatus} lastUpdateClock={formatClock(clockMin)} />
      <div className={`user-layout ${!right ? "no-right" : ""}`}>
        <div className="col left">{left}</div>
        <div className="col center">{map}</div>
        {right && <div className="col right">{right}</div>}
      </div>
    </div>
  );
}
