import { useState } from "react";
import { api } from "../../services/api";

const CAUSES = [
  { id: "tree_fall", label: "Fallen tree on the track" },
  { id: "road_blockage", label: "Road blockage near the line" },
  { id: "accident", label: "Vehicle/accident on the track" },
  { id: "other", label: "Something else" },
];

const MAX_DIMENSION = 900; // downscaled before upload -- this rides the live tick broadcast to every connected client, so a multi-MB phone photo isn't an option

// Resizes and JPEG-compresses the image client-side so the WebSocket payload
// this rides on (broadcast to every connected admin/rider every tick) stays
// small, instead of shipping a raw multi-megabyte camera photo.
function downscaleImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like a valid image."));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Lets a rider report what they can actually see -- a fallen tree, a car on
// the track, a blocked road -- with a photo, so an operator has real evidence
// before deciding whether (and who) to notify.
export default function ReportIssuePanel({ trainId }) {
  const [cause, setCause] = useState(CAUSES[0].id);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);
    try {
      setImagePreview(await downscaleImage(file));
    } catch (err) {
      setImageError(err.message);
      setImagePreview(null);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!imagePreview) { setFlash({ ok: false, text: "Add a photo before submitting -- it's what the operator acts on." }); return; }
    if (!location.trim()) { setFlash({ ok: false, text: "Say roughly where this is (a station name or landmark)." }); return; }
    setBusy(true);
    setFlash(null);
    try {
      await api.submitComplaint({ cause, description, location, imageDataUrl: imagePreview, trainId });
      setFlash({ ok: true, text: "Reported. An operator will review the photo and notify the responsible authority if needed." });
      setLocation("");
      setDescription("");
      setImagePreview(null);
      e.target.reset?.();
    } catch (err) {
      setFlash({ ok: false, text: `Could not submit: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Report a Blockage</h2>
      <p className="threshold-hint">
        Seen a fallen tree, a blocked road, or a vehicle on the track? Report it with a photo -- it goes straight
        to the operations team.
      </p>

      <form onSubmit={submit}>
        <label className="field-label">What are you seeing?</label>
        <select value={cause} onChange={(e) => setCause(e.target.value)}>
          {CAUSES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>

        <label className="field-label">Where (station or landmark)</label>
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. just past Byculla station" />

        <label className="field-label">Details (optional)</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything else the operator should know" />

        <label className="field-label">Photo</label>
        <input type="file" accept="image/*" capture="environment" onChange={handleFile} />
        {imageError && <p className="picker-warn">{imageError}</p>}
        {imagePreview && (
          <img src={imagePreview} alt="Preview of the reported blockage" className="complaint-photo-preview" />
        )}

        <button className="btn-primary full" style={{ marginTop: 12 }} disabled={busy} type="submit">
          {busy ? "Submitting…" : "Submit Report"}
        </button>

        {flash && <div className={`flash ${flash.ok ? "ok" : "bad"}`}>{flash.text}</div>}
      </form>
    </div>
  );
}
