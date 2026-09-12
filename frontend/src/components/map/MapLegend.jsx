import { LINES } from "../user/TrainPickerModal";

// Deliberately just three lines, because that's all the map's colors mean:
// (1) your own route is a risk/delay gradient, (2) every other bold color is
// a different real simulated line, (3) red anywhere is an active delay/issue
// -- never a line's identity.
export default function MapLegend() {
  const otherLines = LINES.filter((l) => l.id !== "central_main");
  return (
    <div className="map-legend">
      <div>
        <span className="sw" style={{ background: "linear-gradient(to right, #1E9E5A, #C97A0B, #D64545)" }} />
        Your route — green (normal) to red (critical)
      </div>
      <div>
        <span className="chip-group">
          {otherLines.map((l) => <span key={l.id} className="sw" style={{ background: l.color }} />)}
        </span>
        Other lines — each its own bold color
      </div>
      <div>
        <span className="sw" style={{ background: "#D64545" }} />
        Red anywhere = an active delay or issue
      </div>
    </div>
  );
}
