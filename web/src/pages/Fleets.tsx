import { formatUI, translateUI } from "../lib/language";
import { useEffect, useMemo, useState } from "react";
import { CircleSlash, OctagonX, Plus, Send } from "lucide-react";
import { api } from "../api/client";
import { useWorld } from "../store/world";
import { MODE_META, ROBOT_TYPE_LABEL, errMsg, titleCase } from "../lib/format";
import { Battery, Empty, Field, Modal, ModeBadge, RobotTypeIcon, vars } from "../components/ui";

function liveStats(states: ReturnType<typeof useWorld.getState>["states"], robotIds: string[]) {
  const s = { total: robotIds.length, online: 0, busy: 0, idle: 0, charging: 0, error: 0, offline: 0 };
  for (const id of robotIds) {
    const st = states[id];
    if (!st?.online) { s.offline++; continue; }
    s.online++;
    if (st.mode === "error" || st.mode === "emergency_stop") s.error++;
    else if (st.current_task_id) s.busy++;
    else if (st.mode === "charging") s.charging++;
    else s.idle++;
  }
  return s;
}

export function FleetsPage() {
  const fleets = useWorld((s) => s.fleets);
  const robots = useWorld((s) => s.robots);
  const states = useWorld((s) => s.states);
  const selectedFleet = useWorld((s) => s.selectedFleet);
  const selectFleet = useWorld((s) => s.selectFleet);
  const openComposer = useWorld((s) => s.openComposer);
  const toast = useWorld((s) => s.toast);
  const [checked, setChecked] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const fid = selectedFleet && fleets[selectedFleet] ? selectedFleet : Object.keys(fleets)[0];
  const fleet = fid ? fleets[fid] : undefined;
  const ids = useMemo(() => Object.values(robots).filter((r) => r.fleet_id === fid).map((r) => r.id).sort(), [robots, fid]);
  useEffect(() => setChecked([]), [fid]);
  const stats = fleet ? liveStats(states, ids) : null;

  const danger = (path: string) => api.post(path, { reason: `Fleet action from the Fleets page` }).catch((e) => toast("error", errMsg(e)));

  return (
    <div className="page">
      <div className="page-grid">
        <div className="panel" style={{ overflow: "auto" }}>
          <div className="panel-head">
            <span className="panel-title">{translateUI("Fleets")}</span>
            <button className="btn sm" onClick={() => setCreating(true)}><Plus size={13} /> {translateUI("New fleet")}</button>
          </div>
          {Object.values(fleets).map((f) => {
            const fIds = Object.values(robots).filter((r) => r.fleet_id === f.id).map((r) => r.id);
            const st = liveStats(states, fIds);
            return (
              <div key={f.id} className={`list-item${f.id === fid ? " sel" : ""}`} onClick={() => selectFleet(f.id)}>
                <span className="fleet-swatch" style={vars({ "--c": f.color })} />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{f.name}</div>
                  <div className="faint" style={{ fontSize: 12 }}>{translateUI(ROBOT_TYPE_LABEL[f.robot_type])} · {st.total} {translateUI("robots ·")}{" "}{st.busy} {translateUI("busy")}</div>
                </div>
              </div>
            );
          })}
        </div>
        {fleet && stats ? (
          <div className="col" style={{ gap: 16, minHeight: 0, overflow: "auto" }}>
            <div className="row between">
              <div>
                <h1 className="row" style={{ gap: 10 }}><span className="fleet-swatch" style={vars({ "--c": fleet.color })} />{fleet.name}</h1>
                <div className="muted">{fleet.description || translateUI(ROBOT_TYPE_LABEL[fleet.robot_type]) + translateUI(" fleet")}</div>
              </div>
              <div className="row">
                <button className="btn" onClick={() => danger(`/fleets/${fleet.id}/stop`)}><CircleSlash size={13} /> {translateUI("Stop fleet")}</button>
                <button className="estop small" onClick={() => danger(`/fleets/${fleet.id}/estop`)}><OctagonX size={13} /> {translateUI("E-stop fleet")}</button>
              </div>
            </div>
            <div className="stat-row" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
              {(["total", "online", "busy", "idle", "charging", "error", "offline"] as const).map((k) => (
                <div key={k}>
                  <div className="v" style={{ color: k === "error" && stats.error ? "var(--err)" : undefined }}>{stats[k]}</div>
                  <div className="k">{translateUI(k)}</div>
                </div>
              ))}
            </div>
            <div className="col" style={{ gap: 6 }}>
              <div className="row between">
                <span className="section-title">{translateUI("Utilization")}</span>
                <span className="muted num">{stats.online ? Math.round((stats.busy / stats.online) * 100) : 0}{translateUI("% of online robots busy")}</span>
              </div>
              <div className="util">
                <i style={{ width: `${(stats.busy / Math.max(1, stats.total)) * 100}%`, background: MODE_META.moving.color }} />
                <i style={{ width: `${(stats.idle / Math.max(1, stats.total)) * 100}%`, background: MODE_META.idle.color }} />
                <i style={{ width: `${(stats.charging / Math.max(1, stats.total)) * 100}%`, background: MODE_META.charging.color }} />
                <i style={{ width: `${(stats.error / Math.max(1, stats.total)) * 100}%`, background: MODE_META.error.color }} />
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <div className="row">
                  <input type="checkbox" className="cbx" checked={checked.length === ids.length && ids.length > 0} onChange={() => setChecked(checked.length === ids.length ? [] : ids)} />
                  <span className="panel-title">{translateUI("Robots")}</span>
                  <span className="faint">{checked.length ? formatUI("{count} selected", { count: checked.length }) : translateUI("select to dispatch")}</span>
                </div>
                <button className="btn primary sm" disabled={!checked.length} onClick={() => openComposer({ robotIds: checked })}><Send size={13} /> {translateUI("Dispatch selected")}</button>
              </div>
              <table className="tbl">
                <thead><tr><th /><th>{translateUI("Robot")}</th><th>{translateUI("Status")}</th><th>{translateUI("Battery")}</th><th>{translateUI("Task")}</th><th>{translateUI("Position")}</th><th>{translateUI("Why")}</th></tr></thead>
                <tbody>
                  {ids.map((id) => {
                    const r = robots[id];
                    const st = states[id];
                    return (
                      <tr key={id} className={checked.includes(id) ? "sel" : ""}>
                        <td style={{ width: 30 }}><input type="checkbox" className="cbx" checked={checked.includes(id)} onChange={() => setChecked(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id])} /></td>
                        <td><span className="row" style={{ gap: 6 }}><RobotTypeIcon type={r.effective.robot_type} size={13} /> <b>{r.name}</b></span></td>
                        <td><ModeBadge mode={st?.online ? st.mode : "offline"} /></td>
                        <td><Battery value={st?.battery_pct ?? null} charging={st?.charging} /></td>
                        <td className="mono">{st?.current_task_id ?? "—"}</td>
                        <td className="mono num">{st ? `${st.pose.x.toFixed(1)}, ${st.pose.y.toFixed(1)}` : "—"}</td>
                        <td className="muted ellipsis" style={{ maxWidth: 260 }}>{translateUI(st?.status_reason ?? "")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="panel" style={{ padding: 14 }}>
              <div className="section-title" style={{ marginBottom: 8 }}>{translateUI("Configuration")}</div>
              <div className="kv" style={{ gridTemplateColumns: "180px 1fr" }}>
                <span>{translateUI("Robot type")}</span><span>{translateUI(ROBOT_TYPE_LABEL[fleet.robot_type])} · {fleet.layer} {translateUI("layer")}</span>
                <span>{translateUI("Capabilities")}</span><span>{fleet.capabilities.map((c) => translateUI(titleCase(c))).join(", ")}</span>
                <span>{translateUI("Navigation")}</span><span>{fleet.navigation.stack}{fleet.navigation.planner ? ` · ${fleet.navigation.planner}` : ""}{fleet.navigation.controller ? ` · ${fleet.navigation.controller}` : ""} {translateUI("· localization")}{" "}{fleet.navigation.localization}</span>
                <span>{translateUI("Footprint")}</span><span>{fleet.footprint.shape === "circle" ? formatUI("circle r {radius} m", { radius: fleet.footprint.radius }) : `${fleet.footprint.length} × ${fleet.footprint.width} m`}</span>
                <span>{translateUI("Motion limits")}</span><span>{fleet.limits.max_speed} {translateUI("m/s · accel")} {fleet.limits.max_accel} {translateUI("· decel")} {fleet.limits.max_decel} m/s²{fleet.limits.cruise_altitude ? formatUI(" · cruise {altitude} m", { altitude: fleet.limits.cruise_altitude }) : ""}</span>
                <span>{translateUI("Battery policy")}</span><span>{translateUI("never below")}{" "}{fleet.battery.min_pct}{translateUI("% · recharge under")} {fleet.battery.recharge_pct}{translateUI("% · full at")} {fleet.battery.charged_pct}%{fleet.charging_required ? translateUI(" · auto-charge") : ""}</span>
                <span>{translateUI("Maps")}</span><span>{fleet.map_ids.join(", ") || translateUI("any")}</span>
                <span>{translateUI("Communication")}</span><span>{fleet.communication.protocol}</span>
                <span>{translateUI("Traffic priority")}</span><span>{fleet.priority}</span>
              </div>
            </div>
          </div>
        ) : (
          <Empty>{translateUI("No fleets. Create one, or register a robot and create its fleet in the wizard.")}</Empty>
        )}
      </div>
      {creating && <CreateFleet onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateFleet({ onClose }: { onClose: () => void }) {
  const maps = useWorld((s) => s.maps);
  const toast = useWorld((s) => s.toast);
  const [f, setF] = useState({ name: "", robot_type: "ugv", color: "#22d3ee", map_id: Object.keys(maps)[0] ?? "", max_speed: 1, capabilities: "navigate, carry_payload, charge", priority: 5 });
  const [err, setErr] = useState("");
  const save = async () => {
    try {
      await api.post("/fleets", {
        name: f.name,
        robot_type: f.robot_type,
        color: f.color,
        map_ids: f.map_id ? [f.map_id] : [],
        layer: f.robot_type === "uav" ? "air" : "ground",
        capabilities: f.capabilities.split(",").map((c) => c.trim()).filter(Boolean),
        limits: { max_speed: f.max_speed },
        priority: f.priority,
      });
      toast("success", `Fleet ${f.name} created`);
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  return (
    <Modal size="sm" title={translateUI("New fleet")} onClose={onClose} footer={<><span style={{ color: "var(--err)" }}>{err}</span><button className="btn primary" onClick={save}>{translateUI("Create fleet")}</button></>}>
      <div className="col" style={{ gap: 10 }}>
        <Field label={translateUI("Name")}><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid2">
          <Field label={translateUI("Robot type")}>
            <select className="input" value={f.robot_type} onChange={(e) => setF({ ...f, robot_type: e.target.value })}>
              {Object.entries(ROBOT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{translateUI(v)}</option>)}
            </select>
          </Field>
          <Field label={translateUI("Map")}>
            <select className="input" value={f.map_id} onChange={(e) => setF({ ...f, map_id: e.target.value })}>
              {Object.values(maps).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label={translateUI("Speed limit (m/s)")}><input className="input" type="number" step="0.1" value={f.max_speed} onChange={(e) => setF({ ...f, max_speed: Number(e.target.value) })} /></Field>
          <Field label={translateUI("Colour")}><input className="input" type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} style={{ padding: 2 }} /></Field>
        </div>
        <Field label={translateUI("Capabilities")} hint={translateUI("comma-separated")}><input className="input" value={f.capabilities} onChange={(e) => setF({ ...f, capabilities: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
