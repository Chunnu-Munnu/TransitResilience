export default function Header({ variant, tagline, nav, right }) {
  return (
    <header className={`app-header ${variant}`}>
      <div className="brand">
        <div className="logo" />
        <div>
          <div className="name">TransitResilience</div>
          <div className="sub">{tagline}</div>
        </div>
      </div>
      <nav>{nav}</nav>
      <div className="header-right">{right}</div>
    </header>
  );
}
