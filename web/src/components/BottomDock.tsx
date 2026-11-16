import { formatUI, translateUI } from "../lib/language";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Check, ListChecks, Server, TrafficCone } from "lucide-react";
import { api } from "../api/client";
import type { NEvent } from "../api/types";
import { useWorld } from "../store/world";
import { SEVERITY_COLOR, TASK_META, ago, clock, dur, errMsg, isOpen } from "../lib/format";
import { Bar, Empty, TaskBadge, vars } from "./ui";

type Tab = "events" | "alerts" | "tasks" | "traffic" | "system";

export function BottomDock() {
  const [tab, setTab] = useState<Tab>("events");
  const alerts = useWorld((s) => s.alerts);
  const tasks = useWorld((s) => s.tasks);
  const traffic = useWorld((s) => s.traffic);
  const activeAlerts = Object.values(alerts).filter((a) => a.status === "active").length;
  const openTasks = Object.values(tasks).filter((t) => isOpen(t.status)).length;
  return (
    <section className="dock">
      <div className="tabs">
        <button className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}><Activity size={13} /> {translateUI("Events")}</button>
        <button className={tab === "alerts" ? "active" : ""} onClick={() => setTab("alerts")}>
          <AlertTriangle size={13} /> {translateUI("Alerts")}{" "}<span className={`count${activeAlerts ? " hot" : ""}`}>{activeAlerts}</span>
        </button>
        <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}><ListChecks size={13} /> {translateUI("Tasks")}{" "}<span className="count">{openTasks}</span></button>
        <button className={tab === "traffic" ? "active" : ""} onClick={() => setTab("traffic")}>
          <TrafficCone size={13} /> {translateUI("Traffic")}{" "}<span className={`count${traffic.waits.length ? " hot" : ""}`}>{traffic.waits.length}</span>
        </button>
        <button className={tab === "system" ? "active" : ""} onClick={() => setTab("system")}><Server size={13} /> {translateUI("System health")}</button>
      </div>
      <div className="dock-body">
        {tab === "events" && <EventsTab />}
        {tab === "alerts" && <AlertsTab />}
        {tab === "tasks" && <TasksTab />}
        {tab === "traffic" && <TrafficTab />}
        {tab === "system" && <SystemTab />}
      </div>
    </section>
  );
}

const GROUPS: Record<string, (e: NEvent) => boolean> = {
  all: () => true,
  tasks: (e) => e.type.includes("TASK"),
  traffic: (e) => e.type.startsWith("TRAFFIC") || e.type.startsWith("ROUTE") || e.type === "SAFETY_STOP",
  robots: (e) => e.type.startsWith("ROBOT_") && !e.type.includes("TASK"),
  warnings: (e) => e.severity !== "info",
};

function EventsTab() {
  const events = useWorld((s) => s.events);
  const robots = useWorld((s) => s.robots);
  const selectRobot = useWorld((s) => s.selectRobot);
  const selectTask = useWorld((s) => s.selectTask);
  const [group, setGroup] = useState("all");
  const shown = useMemo(() => events.filter(GROUPS[group]).slice(0, 250), [events, group]);
  return (
    <div>
      <div className="row" style={{ padding: "6px 12px", gap: 4, position: "sticky", top: 0, background: "var(--bg-2)", zIndex: 1 }}>
        {Object.keys(GROUPS).map((g) => (
          <button key={g} className={`chip${group === g ? " on" : ""}`} style={{ height: 22 }} onClick={() => setGroup(g)}>{translateUI(g)}</button>
        ))}
      </div>
      {shown.length === 0 && <Empty>{translateUI("No events yet.")}</Empty>}
      {shown.map((e) => (
        <div
          key={e.id}
          className="ev"
          onClick={() => {
            if (e.task_id) selectTask(e.task_id);
            else if (e.robot_id && robots[e.robot_id]) selectRobot(e.robot_id);
          }}
        >
          <span className="t">{clock(e.ts)}</span>
          <span className="dot" style={vars({ "--c": SEVERITY_COLOR[e.severity] })} />
          <span className="ty" title={e.type}>{translateUI(e.type)}</span>
          <span>{translateUI(e.message)}</span>
        </div>
      ))}
    </div>
  );
}

function AlertsTab() {
  const alerts = useWorld((s) => s.alerts);
  const toast = useWorld((s) => s.toast);
  const list = Object.values(alerts).filter((a) => a.status !== "resolved").sort((a, b) => b.raised_at - a.raised_at);
  if (!list.length) return <Empty>{translateUI("No active alerts. Battery, connectivity, e-stop, restricted-zone and task failures raise alerts here.")}</Empty>;
  return (
    <table className="tbl">
      <thead><tr><th>{translateUI("Severity")}</th><th>{translateUI("Alert")}</th><th>{translateUI("Detail")}</th><th>{translateUI("Raised")}</th><th /></tr></thead>
      <tbody>
        {list.map((a) => (
          <tr key={a.id}>
            <td><span className="badge" style={vars({ "--c": SEVERITY_COLOR[a.severity] })}>{translateUI(a.severity)}</span></td>
            <td style={{ fontWeight: 550 }}>{translateUI(a.title)}</td>
            <td className="muted">{translateUI(a.message)}</td>
            <td className="faint">{ago(a.raised_at)}</td>
            <td style={{ textAlign: "right" }}>
              {a.status === "active" ? (
                <button className="btn sm" onClick={() => api.post(`/alerts/${a.id}/ack`).catch((e) => toast("error", errMsg(e)))}><Check size={12} /> {translateUI("Acknowledge")}</button>
              ) : <span className="faint">{translateUI("acknowledged")}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TasksTab() {
  const tasks = useWorld((s) => s.tasks);
  const robots = useWorld((s) => s.robots);
  const selectTask = useWorld((s) => s.selectTask);
  const list = Object.values(tasks).sort((a, b) => Number(isOpen(b.status)) - Number(isOpen(a.status)) || b.created_at - a.created_at).slice(0, 60);
  if (!list.length) return <Empty>{translateUI("No tasks yet — create one from a waypoint, the robot panel, or the command bar.")}</Empty>;
  return (
    <table className="tbl">
      <thead><tr><th>{translateUI("Task")}</th><th>{translateUI("Type")}</th><th>{translateUI("Robot")}</th><th>{translateUI("Status")}</th><th style={{ width: 130 }}>{translateUI("Progress")}</th><th>{translateUI("Why")}</th></tr></thead>
      <tbody>
        {list.map((t) => (
          <tr key={t.id} className="click" onClick={() => selectTask(t.id)}>
            <td className="mono">{t.id}</td>
            <td>{translateUI(t.type)}</td>
            <td>{t.assigned_robot ? robots[t.assigned_robot]?.name ?? t.assigned_robot : "—"}</td>
            <td><TaskBadge status={t.status} /></td>
            <td><Bar value={t.progress} color={TASK_META[t.status].color} /></td>
            <td className="muted ellipsis" style={{ maxWidth: 420 }}>{translateUI(t.status_reason)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrafficTab() {
  const traffic = useWorld((s) => s.traffic);
  const robots = useWorld((s) => s.robots);
  const name = (id: string | null) => (id ? robots[id]?.name ?? id : "—");
  const conflicts = [...traffic.conflicts].reverse();
  const perRobot = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of traffic.reservations) m[r.robot_id] = (m[r.robot_id] ?? 0) + 1;
    return m;
  }, [traffic.reservations]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", minHeight: "100%" }}>
      <div style={{ borderRight: "1px solid var(--line)" }}>
        <div className="section-title" style={{ padding: "8px 12px 4px" }}>{translateUI("Conflicts — predicted and resolved before they happen")}</div>
        {conflicts.length === 0 && <Empty>{translateUI("No conflicts yet.")}</Empty>}
        {conflicts.map((c) => (
          <div key={c.id} style={{ padding: "7px 12px", borderBottom: "1px solid var(--line)" }}>
            <div className="row" style={{ gap: 6 }}>
              <span className="badge" style={vars({ "--c": "#fbbf24" })}>{translateUI(c.kind.replace("_", "-"))}</span>
              <span style={{ fontWeight: 550 }}>{c.location_name}</span>
              <span className="faint" style={{ marginLeft: "auto" }}>{clock(c.detected_at)}</span>
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{translateUI(c.message)}</div>
            {c.resolution && (
              <div style={{ fontSize: 12.5, marginTop: 2, color: "var(--ok)" }}>✓ {translateUI(c.resolution.message)}</div>
            )}
          </div>
        ))}
      </div>
      <div>
        <div className="section-title" style={{ padding: "8px 12px 4px" }}>{translateUI("Waiting robots")}</div>
        {traffic.waits.length === 0 && <div className="faint" style={{ padding: "4px 12px 10px" }}>{translateUI("Nobody is waiting.")}</div>}
        {traffic.waits.map((w) => (
          <div key={w.robot_id} style={{ padding: "5px 12px", fontSize: 12.5 }}>
            <b>{name(w.robot_id)}</b> <span className="muted">{translateUI(w.reason)}</span>
          </div>
        ))}
        <div className="section-title" style={{ padding: "10px 12px 4px" }}>{translateUI("Reservations held")}</div>
        <div style={{ padding: "0 12px 10px", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(perRobot).map(([rid, n]) => (
            <span key={rid} className="badge">{name(rid)} · {n}</span>
          ))}
        </div>
        <div className="section-title" style={{ padding: "4px 12px" }}>{translateUI("Planned itineraries")}</div>
        {traffic.itineraries.map((it) => (
          <div key={it.robot_id} style={{ padding: "3px 12px", fontSize: 12 }} className="muted">
            <b style={{ color: "var(--text)" }}>{name(it.robot_id)}</b> · {it.route.length - 1} {translateUI("hops · ETA")}{" "}{dur(it.eta)}
          </div>
        ))}
      </div>
    </div>
  );
}

interface SystemInfo {
  core: { ok: boolean; version: string; uptime_s: number; db: string };
  simulation: { running: boolean; speed: number; engine: string; robots: string[] };
  ros2: { ok: boolean | null; detail: string };
  agent: { ok: boolean; latency_ms?: number; url: string; error?: string };
  mcp: { ok: boolean; latency_ms?: number; url: string; error?: string };
  llm: { provider: string; configured: boolean };
  websocket_clients: number;
  counts: Record<string, number>;
}

export function SystemTab() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () => api.get<SystemInfo>("/system").then((i) => alive && setInfo(i)).catch((e) => alive && setErr(errMsg(e)));
    void load();
    const t = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  if (err && !info) return <Empty>{err}</Empty>;
  if (!info) return <Empty>{translateUI("Loading…")}</Empty>;
  const rows: [string, boolean | null, string][] = [
    ["Nayantra Core", info.core.ok, formatUI("v{version} · up {duration} · {db}", { version: info.core.version, duration: dur(info.core.uptime_s), db: info.core.db })],
    ["Simulation", info.simulation.running, formatUI("{engine} · {count} robots · {speed}×", { engine: info.simulation.engine, count: info.simulation.robots.length, speed: info.simulation.speed })],
    ["ROS 2 runtime", info.ros2.ok, info.ros2.detail],
    ["MCP server", info.mcp.ok, info.mcp.ok ? `${info.mcp.url} · ${info.mcp.latency_ms} ms` : formatUI("{url} unreachable", { url: info.mcp.url })],
    ["Agent (LLM)", info.agent.ok, info.agent.ok ? `${info.llm.provider}${info.llm.configured ? "" : translateUI(" — no API key")} · ${info.agent.latency_ms} ms` : formatUI("{url} unreachable", { url: info.agent.url })],
    ["Realtime clients", true, formatUI("{count} WebSocket subscriber(s)", { count: info.websocket_clients })],
  ];
  return (
    <table className="tbl">
      <tbody>
        {rows.map(([k, ok, d]) => (
          <tr key={k}>
            <td style={{ width: 170, fontWeight: 550 }}>{translateUI(k)}</td>
            <td style={{ width: 110 }}>
              <span className="badge" style={vars({ "--c": ok === null ? "#7c8ea0" : ok ? "#34d399" : "#f87171" })}>{ok === null ? translateUI("idle") : ok ? translateUI("ok") : translateUI("down")}</span>
            </td>
            <td className="muted">{translateUI(d)}</td>
          </tr>
        ))}
        <tr>
          <td style={{ fontWeight: 550 }}>{translateUI("Registry")}</td>
          <td />
          <td className="muted">{Object.entries(info.counts).map(([k, v]) => v + " " + translateUI(k.replace("_", " "))).join(" · ")}</td>
        </tr>
      </tbody>
    </table>
  );
}
