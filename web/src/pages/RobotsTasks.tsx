import { translateUI } from "../lib/language";
import { useMemo, useState } from "react";
import { MapPin, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Robot, TaskStatus } from "../api/types";
import { useWorld } from "../store/world";
import { ROBOT_TYPE_LABEL, TASK_META, clock, errMsg, isOpen } from "../lib/format";
import { Bar, Battery, Empty, Field, Modal, ModeBadge, RobotTypeIcon, TaskBadge, vars } from "../components/ui";

export function RobotsPage() {
  const robots = useWorld((s) => s.robots);
  const fleets = useWorld((s) => s.fleets);
  const states = useWorld((s) => s.states);
  const openWizard = useWorld((s) => s.openWizard);
  const toast = useWorld((s) => s.toast);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Robot | null>(null);
  const list = Object.values(robots)
    .filter((r) => !q || `${r.name} ${r.id} ${r.fleet_id} ${r.model}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.fleet_id.localeCompare(b.fleet_id) || a.name.localeCompare(b.name));
  const show = (id: string, mapId: string | null) => {
    const s = useWorld.getState();
    if (mapId) s.setActiveMap(mapId);
    s.setPage("operations");
    s.selectRobot(id);
  };
  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 14 }}>
        <h1>{translateUI("Robots")}{" "}<span className="faint" style={{ fontWeight: 400, fontSize: 14 }}>{list.length}</span></h1>
        <div className="row">
          <input className="input" style={{ width: 240 }} placeholder={translateUI("Filter…")} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary" onClick={() => openWizard(true)}><Plus size={14} /> {translateUI("Register robot")}</button>
        </div>
      </div>
      <div className="panel">
        <table className="tbl">
          <thead>
            <tr><th>{translateUI("Robot")}</th><th>{translateUI("Fleet")}</th><th>{translateUI("Model")}</th><th>{translateUI("Link")}</th><th>{translateUI("Status")}</th><th>{translateUI("Battery")}</th><th>{translateUI("Capabilities")}</th><th /></tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const st = states[r.id];
              const f = fleets[r.fleet_id];
              const failed = r.checks.find((c) => c.required && !c.ok);
              return (
                <tr key={r.id} className="click" onClick={() => show(r.id, r.effective.map_id)}>
                  <td>
                    <span className="row" style={{ gap: 7 }}>
                      <span style={{ color: f?.color, display: "inline-flex" }}><RobotTypeIcon type={r.effective.robot_type} size={14} /></span>
                      <b>{r.name}</b> <span className="faint mono">{r.id}</span>
                    </span>
                  </td>
                  <td>{f?.name ?? r.fleet_id}</td>
                  <td className="muted">{translateUI(ROBOT_TYPE_LABEL[r.effective.robot_type])} · {[r.manufacturer, r.model].filter(Boolean).join(" ") || "—"}</td>
                  <td>
                    <span className="badge" style={vars({ "--c": st?.online ? "#34d399" : failed ? "#f87171" : "#7c8ea0" })} title={failed?.detail ?? st?.connection_detail}>
                      {r.effective.communication.protocol}{st?.online ? "" : failed ? " · failed" : " · offline"}
                    </span>
                  </td>
                  <td>{r.enabled ? <ModeBadge mode={st?.online ? st.mode : "offline"} /> : <span className="badge">{translateUI("decommissioned")}</span>}</td>
                  <td><Battery value={st?.battery_pct ?? null} charging={st?.charging} /></td>
                  <td className="muted ellipsis" style={{ maxWidth: 240 }}>{r.effective.capabilities.join(", ")}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn ghost sm icon" title={translateUI("Show on map")} onClick={() => show(r.id, r.effective.map_id)}><MapPin size={13} /></button>
                    <button className="btn ghost sm icon" title={translateUI("Edit robot")} aria-label={translateUI("Edit robot")} onClick={() => setEditing(r)}><Pencil size={13} /></button>
                    <button
                      className="btn ghost sm icon"
                      title={r.enabled ? translateUI("Decommission (take out of service)") : "Recommission"}
                      onClick={() => api.patch(`/robots/${r.id}`, { enabled: !r.enabled }).catch((e) => toast("error", errMsg(e)))}
                    >
                      <Power size={13} />
                    </button>
                    <button className="btn ghost sm icon" title={translateUI("Remove robot (asks for confirmation)")} onClick={() => api.del(`/robots/${r.id}`).catch((e) => toast("error", errMsg(e)))}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <Empty>{translateUI("No robots registered yet.")}</Empty>}
      </div>
      {editing && <EditRobot robot={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

type RobotForm = {
  name: string;
  manufacturer: string;
  model: string;
  fleet_id: string;
  map_id: string;
  capabilities: string;
  payload_kg: string;
  battery_wh: string;
};

function EditRobot({ robot, onClose }: { robot: Robot; onClose: () => void }) {
  const fleets = useWorld((s) => s.fleets);
  const maps = useWorld((s) => s.maps);
  const toast = useWorld((s) => s.toast);
  const [form, setForm] = useState<RobotForm>(() => ({
    name: robot.name,
    manufacturer: robot.manufacturer,
    model: robot.model,
    fleet_id: robot.fleet_id,
    map_id: robot.navigation.map_id ?? "",
    capabilities: robot.capabilities?.join(", ") ?? "",
    payload_kg: robot.physical.payload_kg == null ? "" : String(robot.physical.payload_kg),
    battery_wh: robot.physical.battery_wh == null ? "" : String(robot.physical.battery_wh),
  }));
  const [err, setErr] = useState("");
  const fleet = fleets[form.fleet_id];
  const mapChoices = fleet?.map_ids ?? [];
  const setFleet = (fleetId: string) => {
    const nextFleet = fleets[fleetId];
    const mapId = nextFleet?.map_ids.includes(form.map_id) ? form.map_id : nextFleet?.map_ids[0] ?? "";
    setForm({ ...form, fleet_id: fleetId, map_id: mapId });
  };
  const optionalNumber = (value: string) => value.trim() === "" ? null : Number(value);
  const save = async () => {
    if (!form.name.trim()) return setErr(translateUI("Enter a robot name."));
    try {
      await api.patch(`/robots/${robot.id}`, {
        name: form.name.trim(), manufacturer: form.manufacturer.trim(), model: form.model.trim(), fleet_id: form.fleet_id,
        capabilities: form.capabilities.trim() ? form.capabilities.split(",").map((capability) => capability.trim()).filter(Boolean) : null,
        navigation: { ...robot.navigation, map_id: form.map_id || null },
        physical: { ...robot.physical, payload_kg: optionalNumber(form.payload_kg), battery_wh: optionalNumber(form.battery_wh) },
      });
      toast("success", translateUI("Robot updated"));
      onClose();
    } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Modal size="sm" title={translateUI("Edit robot")} onClose={onClose} footer={<><span style={{ color: "var(--err)" }}>{err}</span><button className="btn" onClick={onClose}>{translateUI("Cancel")}</button><button className="btn primary" onClick={save}>{translateUI("Save changes")}</button></>}>
      <div className="col" style={{ gap: 10 }}>
        <Field label={translateUI("Robot name")}><input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="grid2">
          <Field label={translateUI("Manufacturer")}><input className="input" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></Field>
          <Field label={translateUI("Model")}><input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
          <Field label={translateUI("Fleet")}><select className="input" value={form.fleet_id} onChange={(e) => setFleet(e.target.value)}>{Object.values(fleets).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label={translateUI("Map")}><select className="input" value={form.map_id} onChange={(e) => setForm({ ...form, map_id: e.target.value })}><option value="">{translateUI("any")}</option>{mapChoices.map((id) => <option key={id} value={id}>{maps[id]?.name ?? id}</option>)}</select></Field>
          <Field label={translateUI("Payload (kg)")}><input className="input" type="number" min="0" step="0.1" value={form.payload_kg} onChange={(e) => setForm({ ...form, payload_kg: e.target.value })} /></Field>
          <Field label={translateUI("Battery capacity (Wh)")}><input className="input" type="number" min="0" step="1" value={form.battery_wh} onChange={(e) => setForm({ ...form, battery_wh: e.target.value })} /></Field>
        </div>
        <Field label={translateUI("Capabilities")} hint={translateUI("Leave blank to inherit fleet capabilities.")}><input className="input" value={form.capabilities} onChange={(e) => setForm({ ...form, capabilities: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

const FILTERS: { id: string; label: string; test: (s: TaskStatus) => boolean }[] = [
  { id: "open", label: "Open", test: (s) => isOpen(s) },
  { id: "waiting", label: "Waiting", test: (s) => s === "waiting_for_traffic" || s === "waiting_for_robot" },
  { id: "done", label: "Completed", test: (s) => s === "completed" },
  { id: "problem", label: "Failed / cancelled", test: (s) => s === "failed" || s === "cancelled" },
  { id: "all", label: "All", test: () => true },
];

export function TasksPage() {
  const tasks = useWorld((s) => s.tasks);
  const robots = useWorld((s) => s.robots);
  const fleets = useWorld((s) => s.fleets);
  const selectTask = useWorld((s) => s.selectTask);
  const openComposer = useWorld((s) => s.openComposer);
  const [filter, setFilter] = useState("open");
  const f = FILTERS.find((x) => x.id === filter)!;
  const list = useMemo(() => Object.values(tasks).filter((t) => f.test(t.status)).sort((a, b) => b.created_at - a.created_at), [tasks, f]);
  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 14 }}>
        <h1>{translateUI("Tasks")}</h1>
        <div className="row">
          <div className="chips">
            {FILTERS.map((x) => (
              <button key={x.id} className={`chip${filter === x.id ? " on" : ""}`} onClick={() => setFilter(x.id)}>
                {translateUI(x.label)} <span className="faint">{Object.values(tasks).filter((t) => x.test(t.status)).length}</span>
              </button>
            ))}
          </div>
          <button className="btn primary" onClick={() => openComposer()}><Plus size={14} /> {translateUI("New task")}</button>
        </div>
      </div>
      <div className="panel">
        <table className="tbl">
          <thead>
            <tr><th>ID</th><th>{translateUI("Type")}</th><th>{translateUI("Created by")}</th><th>{translateUI("Fleet")}</th><th>{translateUI("Robot")}</th><th>{translateUI("Priority")}</th><th>{translateUI("Status")}</th><th>{translateUI("Created")}</th><th>{translateUI("Started")}</th><th>{translateUI("Completed")}</th><th>{translateUI("Current step")}</th><th style={{ width: 120 }}>{translateUI("Progress")}</th></tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id} className="click" onClick={() => selectTask(t.id)} title={t.status_reason}>
                <td className="mono">{t.id}</td>
                <td>{translateUI(t.type)}</td>
                <td>{t.created_by}{t.trace.source === "llm" ? " (AI)" : ""}</td>
                <td>{t.assigned_fleet ? fleets[t.assigned_fleet]?.name ?? t.assigned_fleet : "—"}</td>
                <td>{t.assigned_robot ? robots[t.assigned_robot]?.name ?? t.assigned_robot : "—"}</td>
                <td className="num">{t.priority}</td>
                <td><TaskBadge status={t.status} /></td>
                <td className="num faint">{clock(t.created_at)}</td>
                <td className="num faint">{t.started_at ? clock(t.started_at) : "—"}</td>
                <td className="num faint">{t.completed_at ? clock(t.completed_at) : "—"}</td>
                <td className="ellipsis" style={{ maxWidth: 200 }}>{translateUI(t.steps[t.current_step]?.label ?? "—")}</td>
                <td><Bar value={t.progress} color={TASK_META[t.status].color} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <Empty>{translateUI("No tasks match.")}</Empty>}
      </div>
    </div>
  );
}
