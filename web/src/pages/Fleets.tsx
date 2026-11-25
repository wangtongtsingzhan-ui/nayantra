import { formatUI, translateUI } from "../lib/language";
import { useEffect, useMemo, useState } from "react";
import { CircleSlash, OctagonX, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Fleet } from "../api/types";
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
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
                <button className="btn icon" onClick={() => setEditing(true)} title={translateUI("Edit fleet")} aria-label={translateUI("Edit fleet")}><Pencil size={14} /></button>
                <button className="btn danger icon" onClick={() => setDeleting(true)} title={translateUI("Delete fleet")} aria-label={translateUI("Delete fleet")}><Trash2 size={14} /></button>
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
      {editing && fleet && <EditFleet fleet={fleet} onClose={() => setEditing(false)} />}
      {deleting && fleet && <DeleteFleet fleet={fleet} robotCount={ids.length} onClose={() => setDeleting(false)} onDeleted={() => { setDeleting(false); selectFleet(null); }} />}
    </div>
  );
}

type FleetForm = {
  name: string;
  description: string;
  robot_type: string;
  color: string;
  map_ids: string[];
  max_speed: number;
  capabilities: string;
  priority: number;
};

function newFleetForm(mapIds: string[]): FleetForm {
  return { name: "", description: "", robot_type: "ugv", color: "#22d3ee", map_ids: mapIds.slice(0, 1), max_speed: 1, capabilities: "navigate, carry_payload, charge", priority: 5 };
}

function FleetFields({ form, setForm, maps, lockRobotType }: {
  form: FleetForm;
  setForm: (form: FleetForm) => void;
  maps: ReturnType<typeof useWorld.getState>["maps"];
  lockRobotType?: boolean;
}) {
  const toggleMap = (id: string) => setForm({ ...form, map_ids: form.map_ids.includes(id) ? form.map_ids.filter((item) => item !== id) : [...form.map_ids, id] });
  return (
    <div className="col" style={{ gap: 10 }}>
      <Field label={translateUI("Name")}><input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label={translateUI("Description")}><textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <div className="grid2">
        <Field label={translateUI("Robot type")}>
          <select className="input" value={form.robot_type} disabled={lockRobotType} onChange={(e) => setForm({ ...form, robot_type: e.target.value })}>
            {Object.entries(ROBOT_TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{translateUI(label)}</option>)}
          </select>
        </Field>
        <Field label={translateUI("Colour")}><input className="input" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ padding: 2 }} /></Field>
        <Field label={translateUI("Speed limit (m/s)")}><input className="input" type="number" min="0.1" step="0.1" value={form.max_speed} onChange={(e) => setForm({ ...form, max_speed: Number(e.target.value) })} /></Field>
        <Field label={translateUI("Traffic priority")}><input className="input" type="number" min="0" max="9" step="1" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></Field>
      </div>
      <Field label={translateUI("Maps")}>
        <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
          {Object.values(maps).map((map) => <label key={map.id} className="row" style={{ gap: 5 }}><input type="checkbox" className="cbx" checked={form.map_ids.includes(map.id)} onChange={() => toggleMap(map.id)} /> {map.name}</label>)}
        </div>
      </Field>
      <Field label={translateUI("Capabilities")} hint={translateUI("comma-separated")}><input className="input" value={form.capabilities} onChange={(e) => setForm({ ...form, capabilities: e.target.value })} /></Field>
    </div>
  );
}

function CreateFleet({ onClose }: { onClose: () => void }) {
  const maps = useWorld((s) => s.maps);
  const toast = useWorld((s) => s.toast);
  const [form, setForm] = useState<FleetForm>(() => newFleetForm(Object.keys(maps)));
  const [err, setErr] = useState("");
  const save = async () => {
    if (!form.name.trim()) return setErr(translateUI("Enter a fleet name."));
    try {
      await api.post("/fleets", {
        name: form.name.trim(), description: form.description.trim(), robot_type: form.robot_type, color: form.color,
        map_ids: form.map_ids, layer: form.robot_type === "uav" ? "air" : "ground",
        capabilities: form.capabilities.split(",").map((capability) => capability.trim()).filter(Boolean), limits: { max_speed: form.max_speed }, priority: form.priority,
      });
      toast("success", translateUI("Fleet created"));
      onClose();
    } catch (e) { setErr(errMsg(e)); }
  };
  return <Modal size="sm" title={translateUI("New fleet")} onClose={onClose} footer={<><span style={{ color: "var(--err)" }}>{err}</span><button className="btn" onClick={onClose}>{translateUI("Cancel")}</button><button className="btn primary" onClick={save}>{translateUI("Create fleet")}</button></>}><FleetFields form={form} setForm={setForm} maps={maps} /></Modal>;
}

function EditFleet({ fleet, onClose }: { fleet: Fleet; onClose: () => void }) {
  const maps = useWorld((s) => s.maps);
  const toast = useWorld((s) => s.toast);
  const [form, setForm] = useState<FleetForm>(() => ({ name: fleet.name, description: fleet.description, robot_type: fleet.robot_type, color: fleet.color, map_ids: fleet.map_ids, max_speed: fleet.limits.max_speed, capabilities: fleet.capabilities.join(", "), priority: fleet.priority }));
  const [err, setErr] = useState("");
  const [battery, setBattery] = useState(() => ({
    min: String(fleet.battery.min_pct), recharge: String(fleet.battery.recharge_pct),
    charged: String(fleet.battery.charged_pct), auto: fleet.charging_required,
  }));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.name.trim()) return setErr(translateUI("Enter a fleet name."));
    const values = [battery.min, battery.recharge, battery.charged].map((s) => s.trim() === "" ? NaN : Number(s));
    if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return setErr(translateUI("Battery thresholds must be numbers between 0 and 100."));
    if (values[0] > values[1] || values[1] >= values[2]) return setErr(translateUI("Minimum battery must not exceed the recharge threshold; the recharge threshold must be below the target."));
    setErr("");
    setSaving(true);
    try {
      await api.patch(`/fleets/${fleet.id}`, {
        name: form.name.trim(), description: form.description.trim(), color: form.color, map_ids: form.map_ids,
        capabilities: form.capabilities.split(",").map((capability) => capability.trim()).filter(Boolean), limits: { ...fleet.limits, max_speed: form.max_speed }, priority: form.priority,
        battery: { ...fleet.battery, min_pct: values[0], recharge_pct: values[1], charged_pct: values[2] },
        charging_required: battery.auto,
      });
      toast("success", translateUI("Fleet updated"));
      onClose();
    } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  };
  return <Modal size="sm" title={translateUI("Edit fleet")} onClose={onClose} footer={<><span style={{ color: "var(--err)" }} role="alert">{err}</span><button className="btn" onClick={onClose}>{translateUI("Cancel")}</button><button className="btn primary" disabled={saving} onClick={save}>{translateUI("Save changes")}</button></>}>
    <FleetFields form={form} setForm={setForm} maps={maps} lockRobotType />
    <div className="col" style={{ gap: 10, marginTop: 16 }}>
      <div className="section-title">{translateUI("Battery policy")}</div>
      <label className="row"><input type="checkbox" className="cbx" checked={battery.auto} onChange={(e) => setBattery({ ...battery, auto: e.target.checked })} /> {translateUI("Auto-charge when battery runs low")}</label>
      <div className="grid2">
        <Field label={translateUI("Minimum battery (%)")}><input className="input" type="number" min="0" max="100" step="0.1" value={battery.min} onChange={(e) => setBattery({ ...battery, min: e.target.value })} /></Field>
        <Field label={translateUI("Recharge below (%)")}><input className="input" type="number" min="0" max="100" step="0.1" value={battery.recharge} onChange={(e) => setBattery({ ...battery, recharge: e.target.value })} /></Field>
        <Field label={translateUI("Charging target (%)")}><input className="input" type="number" min="0" max="100" step="0.1" value={battery.charged} onChange={(e) => setBattery({ ...battery, charged: e.target.value })} /></Field>
      </div>
      <div className="faint">{translateUI("The policy applies to this fleet. Auto-charge needs an idle robot and a compatible simulated charger.")}</div>
    </div>
  </Modal>;
}

function DeleteFleet({ fleet, robotCount, onClose, onDeleted }: { fleet: Fleet; robotCount: number; onClose: () => void; onDeleted: () => void }) {
  const toast = useWorld((s) => s.toast);
  const [err, setErr] = useState("");
  const remove = async () => {
    try {
      await api.del(`/fleets/${fleet.id}`);
      toast("success", translateUI("Fleet deleted"));
      onDeleted();
    } catch (e) { setErr(errMsg(e)); }
  };
  const blocked = robotCount > 0;
  return <Modal size="sm" title={translateUI("Delete fleet?")} onClose={onClose} footer={<><span style={{ color: "var(--err)" }}>{err}</span><button className="btn" onClick={onClose}>{translateUI("Cancel")}</button><button className="btn danger" disabled={blocked} onClick={remove}><Trash2 size={13} /> {translateUI("Delete")}</button></>}><div className="col" style={{ gap: 10 }}><div>{fleet.name}</div><div className={blocked ? "reason" : "muted"}>{blocked ? translateUI("This fleet still has robots. Move or remove them before deleting it.") : translateUI("This action cannot be undone.")}</div></div></Modal>;
}
