import { formatUI, translateUI } from "../lib/language";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Layers, Maximize, Minus, Plus, TriangleAlert } from "lucide-react";
import type { Point2 } from "../api/types";
import type { MapControl } from "../map/MapView";
import { type LayerKey, useWorld } from "../store/world";

const LAYER_LABEL: Record<LayerKey, string> = {
  image: "Map image", grid: "Grid", walls: "Walls & obstacles", zones: "Zones", lanes: "Ground lanes",
  airLanes: "Air corridors", waypoints: "Waypoints", labels: "Labels", robots: "Robots", paths: "Planned paths",
  trails: "Trajectories", reservations: "Traffic reservations", conflicts: "Conflicts & waits",
};

export function MapChrome({ control, cursor, pxPerM, view, setView }: { control: React.MutableRefObject<MapControl | null>; cursor: Point2 | null; pxPerM: number; view: "2d" | "3d"; setView: (view: "2d" | "3d") => void }) {
  const maps = useWorld((s) => s.maps);
  const activeMapId = useWorld((s) => s.activeMapId);
  const setActiveMap = useWorld((s) => s.setActiveMap);
  const layers = useWorld((s) => s.layers);
  const toggleLayer = useWorld((s) => s.toggleLayer);
  const goTo = useWorld((s) => s.goTo);
  const [open, setOpen] = useState(false);
  const [legend, setLegend] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !pop.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === "f" || e.key === "F") control.current?.fit();
      if (e.key === "+" || e.key === "=") control.current?.zoom(0.8);
      if (e.key === "-") control.current?.zoom(1.25);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [control]);

  // scale bar: pick a round length ≈ 90 px
  const target = 90 / Math.max(pxPerM, 1e-6);
  const nice = [0.5, 1, 2, 5, 10, 20, 50].find((v) => v >= target) ?? 50;
  const bounds = activeMapId ? maps[activeMapId]?.bounds : undefined;
  const gridStep = bounds ? Math.max(2, Math.ceil(Math.max(bounds.max_x - bounds.min_x, bounds.max_y - bounds.min_y) / 100)) : 2;
  return (
    <>
      <div className="map-overlay map-tl" ref={pop}>
        <div className="map-chip glass">
          <select className="input" style={{ height: 24, width: 190, border: 0, background: "transparent", padding: 0 }} value={activeMapId ?? ""} onChange={(e) => setActiveMap(e.target.value)} aria-label={translateUI("Map")}>
            {Object.values(maps).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button className="btn ghost sm icon" onClick={() => setOpen(!open)} title={translateUI("Layers")} aria-label={translateUI("Layers")}><Layers size={14} /></button>
        </div>
        <div className="map-chip glass scene-view-controls">
          <button className={`btn ghost sm ${view === "2d" ? "active" : ""}`} aria-pressed={view === "2d"} onClick={() => setView("2d")}>2D</button>
          <button className={`btn ghost sm ${view === "3d" ? "active" : ""}`} aria-pressed={view === "3d"} onClick={() => { setView("3d"); useWorld.getState().setGoTo(false); }}>3D</button>
        </div>
        {open && (
          <div className="layers-pop glass">
            {(Object.keys(LAYER_LABEL) as LayerKey[]).map((k) => (
              <label key={k}>
                <input type="checkbox" className="cbx" checked={layers[k]} onChange={() => toggleLayer(k)} /> {translateUI(LAYER_LABEL[k])}
              </label>
            ))}
          </div>
        )}
        {goTo && (
          <div className="map-chip glass" style={{ paddingRight: 10, borderColor: "var(--accent)" }}>
            <span style={{ color: "var(--accent-fg)", fontWeight: 600 }}>{translateUI("Go-to mode")}</span>
            <span className="muted">{translateUI("click a waypoint · Esc to cancel")}</span>
          </div>
        )}
      </div>
      <div className="map-overlay map-br">
        <div className="glass col" style={{ gap: 0, padding: 2 }}>
          <button className="btn ghost icon" onClick={() => control.current?.zoom(0.75)} title={translateUI("Zoom in (+)")}><Plus size={15} /></button>
          <button className="btn ghost icon" onClick={() => control.current?.zoom(1.33)} title={translateUI("Zoom out (−)")}><Minus size={15} /></button>
          <button className="btn ghost icon" onClick={() => control.current?.fit()} title={translateUI("Fit to view (F)")}><Maximize size={14} /></button>
        </div>
      </div>
      <div className="map-overlay map-bl">
        {view === "3d" && <div className="scene-legend glass">
          <button className="btn ghost sm" aria-expanded={legend} onClick={() => setLegend(!legend)}>{translateUI("3D legend")}</button>
          {legend && <div className="scene-legend-content">
            {[["#34d399", "Moving / acting"], ["#e5c75a", "Idle"], ["#60a5fa", "Charging"], ["#fbbf24", "Waiting / paused"], ["#f87171", "Error / emergency stop"], ["#8493a3", "Offline"]].map(([color, label]) => <span key={label}><i style={{ background: color }} />{translateUI(label)}</span>)}
            <span><i style={{ background: "#71b9d1" }} />{translateUI("Ground lanes")}</span>
            <span><i style={{ background: "#e8b955" }} />{translateUI("Air corridors")}</span>
            <span><i style={{ background: "#ef4444" }} />{translateUI("Restricted zone")}</span>
            <span><i style={{ background: "#fbbf24" }} />{translateUI("No-fly zone")}</span>
            <span><i style={{ background: "#60a5fa" }} />{translateUI("Slow zone")}</span>
            <span className="scene-legend-note">{translateUI("Route colors match robot label borders")}</span>
          </div>}
        </div>}
        {(view === "2d" || cursor || layers.grid) &&
        <div className="glass scale">
          {view === "2d" && <span className="row" style={{ gap: 6 }}>
            <span style={{ display: "inline-block", width: nice * pxPerM, height: 6, borderLeft: "1.5px solid var(--text-2)", borderRight: "1.5px solid var(--text-2)", borderBottom: "1.5px solid var(--text-2)" }} />
            {nice} m
          </span>}
          {view === "3d" && layers.grid && <span>{formatUI("Grid spacing: {distance} m", { distance: gridStep })}</span>}
          <span className="coords">{cursor ? `x ${cursor[0].toFixed(2)}  y ${cursor[1].toFixed(2)}` : " "}</span>
        </div>
        }
      </div>
    </>
  );
}

/** Top-right stack: "Potential conflict detected … ✓ resolved" as it happens. */
export function ConflictFlashes() {
  const flashes = useWorld((s) => s.flashes);
  const robots = useWorld((s) => s.robots);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  const now = Date.now();
  const live = flashes.filter((f) => now - f.at < 9000).slice(-3);
  if (!live.length) return null;
  const name = (id: string) => robots[id]?.name ?? id;
  return (
    <div className="map-overlay map-tr">
      {live.map(({ conflict: c, at }) => {
        const resolved = now - at > 900;
        return (
          <div key={c.id} className="flash glass">
            <div className="t"><TriangleAlert size={13} /> {translateUI("Potential")}{" "}{translateUI(c.kind.replace("_", "-"))} {translateUI("conflict")}</div>
            <div className="l">
              <span>{c.robots.map(name).join("  ⇄  ")}</span>
              <span className="muted">→ {c.location_name}</span>
            </div>
            {!resolved ? (
              <div className="l muted">{translateUI("Resolving…")}</div>
            ) : (
              <>
                <div className="l ok"><CheckCircle2 size={12} /> {translateUI(c.resolution?.message ?? "resolved")}</div>
                <div className="l ok"><CheckCircle2 size={12} /> {translateUI("Route reservations updated · no collision")}</div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
