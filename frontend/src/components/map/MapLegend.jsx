export default function MapLegend() {
  return (
    <div className="map-legend">
      <div><span className="sw" style={{ background: "#1E9E5A" }} />Normal track</div>
      <div><span className="sw" style={{ background: "#C97A0B" }} />Elevated risk</div>
      <div><span className="sw" style={{ background: "#D64545" }} />High / critical risk</div>
      <div><span className="sw dashed" />Proposed reroute</div>
      <div><span className="sw blocked" />Segment closed</div>
    </div>
  );
}
