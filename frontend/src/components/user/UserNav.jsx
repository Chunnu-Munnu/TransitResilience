import { useEffect, useLayoutEffect, useRef, useState } from "react";

const PASSENGER_TABS = [
  { id: "my_trip", label: "My Trip" },
  { id: "live_journey", label: "Live Journey" },
  { id: "service_alerts", label: "Service Alerts" },
];

/**
 * UserNav component for Passenger Header providing:
 * 1. Shared sliding underline tab indicator pattern matching AdminNav.
 * 2. Active and hover state styles.
 */
export default function UserNav({ activeTab = "my_trip", onTabChange }) {
  const navRef = useRef(null);
  const tabRefs = useRef({});

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
  }, [activeTab]);

  useEffect(() => {
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [activeTab]);

  return (
    <nav className="admin-nav-container user-nav-container" ref={navRef}>
      {PASSENGER_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => (tabRefs.current[tab.id] = el)}
            onClick={() => onTabChange && onTabChange(tab.id)}
            className={`admin-nav-tab ${isActive ? "active" : ""}`}
            type="button"
            style={{ background: "none", border: "none", font: "inherit", cursor: "pointer" }}
          >
            {tab.label}
          </button>
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
