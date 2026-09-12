import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const TABS = [
  { id: "operations", label: "Operations", path: "/admin" },
  { id: "review", label: "Review Queue", path: "/admin/review" },
  { id: "scenario", label: "Scenario Control", path: "/admin/scenario" },
  { id: "decisions", label: "Decision Log", path: "/admin/decisions" },
];

/**
 * AdminNav component providing:
 * 1. Smooth shared sliding underline indicator that moves dynamically between tabs.
 * 2. Hover and active background highlight states using established theme tokens.
 */
export default function AdminNav({ activeTab = "operations" }) {
  const navRef = useRef(null);
  const tabRefs = useRef({});
  const location = useLocation();

  const [indicatorStyle, setIndicatorStyle] = useState({
    left: 0,
    width: 0,
    opacity: 0,
  });

  const updateIndicator = () => {
    const activeEl = tabRefs.current[activeTab];
    const navEl = navRef.current;

    if (activeEl && navEl) {
      const activeRect = activeEl.getBoundingClientRect();
      const navRect = navEl.getBoundingClientRect();

      setIndicatorStyle({
        left: activeRect.left - navRect.left,
        width: activeRect.width,
        opacity: 1,
      });
    }
  };

  useLayoutEffect(() => {
    updateIndicator();
  }, [activeTab, location.pathname]);

  useEffect(() => {
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [activeTab]);

  return (
    <nav className="admin-nav-container" ref={navRef}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            ref={(el) => (tabRefs.current[tab.id] = el)}
            to={tab.path}
            className={`admin-nav-tab ${isActive ? "active" : ""}`}
          >
            {tab.label}
          </Link>
        );
      })}
      <span
        className="nav-sliding-indicator"
        style={{
          transform: `translateX(${indicatorStyle.left}px)`,
          width: `${indicatorStyle.width}px`,
          opacity: indicatorStyle.opacity,
        }}
      />
    </nav>
  );
}
