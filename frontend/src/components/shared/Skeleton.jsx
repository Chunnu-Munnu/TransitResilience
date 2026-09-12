import React from "react";

export function SkeletonBox({ width = "100%", height = "20px", style = {} }) {
  return <div className="skeleton" style={{ width, height, ...style }} />;
}

export function SkeletonCard() {
  return (
    <div className="card trip-card" style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
      <SkeletonBox width="40%" height="16px" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
        <SkeletonBox width="30%" height="24px" />
        <SkeletonBox width="20%" height="20px" style={{ borderRadius: "12px" }} />
      </div>
      <SkeletonBox width="70%" height="14px" />
      <SkeletonBox width="100%" height="60px" style={{ marginTop: "8px", borderRadius: "10px" }} />
      <SkeletonBox width="100%" height="8px" style={{ marginTop: "4px" }} />
    </div>
  );
}

export function SkeletonList({ count = 5 }) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px" }}>
      <SkeletonBox width="50%" height="18px" style={{ marginBottom: "8px" }} />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "8px 0" }}>
          <SkeletonBox width="24px" height="24px" style={{ borderRadius: "50%" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
            <SkeletonBox width="40%" height="14px" />
            <SkeletonBox width="60%" height="12px" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="user-layout">
      <div className="col left">
        <SkeletonCard />
      </div>
      <div className="col center">
        <div className="card" style={{ height: "100%", minHeight: "420px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <SkeletonBox width="30%" height="20px" />
          <SkeletonBox width="100%" height="100%" style={{ flex: 1, borderRadius: "10px" }} />
        </div>
      </div>
      <div className="col right">
        <SkeletonList count={6} />
      </div>
    </div>
  );
}
