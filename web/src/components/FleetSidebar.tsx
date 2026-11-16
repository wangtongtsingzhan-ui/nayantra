import { translateUI } from "../lib/language";
import { useMemo, useState } from "react";
import { useLanguage } from "../lib/language";
import { ChevronDown, ChevronRight, Pause, Play, Plus, RotateCcw, Square } from "lucide-react";
import { api } from "../api/client";
import type { RobotState } from "../api/types";
import { useWorld } from "../store/world";
import { MODE_META, errMsg } from "../lib/format";
import { Battery, RobotTypeIcon, StatusDot, vars } from "./ui";

export function FleetSidebar() {
  const [zh] = useLanguage();
  const fleets = useWorld((s) => s.fleets);
  const robots = useWorld((s) => s.robots);
  const states = useWorld((s) => s.states);
  const selected = useWorld((s) => s.selectedRobots);
  const selectRobot = useWorld((s) => s.selectRobot);
  const setSelected = useWorld((s) => s.setSelectedRobots);
  const openWizard = useWorld((s) => s.openWizard);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const byFleet: Record<string, string[]> = {};
    for (const r of Object.values(robots)) (byFleet[r.fleet_id] ??= []).push(r.id);
    for (const ids of Object.values(byFleet)) ids.sort((a, b) => robots[a].name.localeCompare(robots[b].name));
    return byFleet;
  }, [robots]);

  return (
    <aside className="side">
      <div className="side-head">
        <span className="section-title">{zh ? "车队" : translateUI("Fleets")}</span>
        <button className="btn sm" onClick={() => openWizard(true)} title={translateUI("Register a robot")}>
          <Plus size={13} /> {zh ? "添加机器人" : translateUI("Robot")}
        </button>
      </div>
      <div className="side-scroll">
        {Object.values(fleets).map((f) => {
          const ids = grouped[f.id] ?? [];
          const online = ids.filter((id) => states[id]?.online).length;
          const busy = ids.filter((id) => states[id]?.current_task_id).length;
          const allSel = ids.length > 0 && ids.every((id) => selected.includes(id));
          const open = !collapsed[f.id];
          return (
            <div key={f.id} className="fleet">
              <div className="fleet-head" onClick={() => setCollapsed({ ...collapsed, [f.id]: open })}>
                {open ? <ChevronDown size={14} className="faint" /> : <ChevronRight size={14} className="faint" />}
                <span className="fleet-swatch" style={vars({ "--c": f.color })} />
                <div className="grow">
                  <div className="fleet-name ellipsis">{f.name}</div>
                  <div className="fleet-meta">
                    {zh ? `${ids.length} 台机器人 · ${online} 在线 · ${busy} 忙碌` : `${ids.length} robots · ${online} online · ${busy} busy`}
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="cbx"
                  title={translateUI("Select the whole fleet")}
                  checked={allSel}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() =>
                    setSelected(allSel ? selected.filter((r) => !ids.includes(r)) : [...new Set([...selected, ...ids])])
                  }
                />
              </div>
              {open &&
                ids.map((id) => {
                  const r = robots[id];
                  const st: RobotState | undefined = states[id];
                  const mode = st?.online ? st.mode : "offline";
                  const sel = selected.includes(id);
                  return (
                    <div
                      key={id}
                      className={`robot-row${sel ? " sel" : ""}`}
                      onClick={(e) => selectRobot(id, e.shiftKey || e.ctrlKey || e.metaKey)}
                      title={translateUI(st?.status_reason || MODE_META[mode].label)}
                    >
                      <StatusDot mode={mode} />
                      <div style={{ minWidth: 0 }}>
                        <div className="rname row" style={{ gap: 6 }}>
                          <span style={{ color: f.color, display: "inline-flex" }}>
                            <RobotTypeIcon type={r.effective.robot_type} size={12} />
                          </span>
                          <span className="ellipsis">{r.name}</span>
                        </div>
                        <div className="rsub ellipsis">
                          {st?.current_task_id ? `${st.current_task_id} · ` : ""}
                          {translateUI(st?.status_reason || MODE_META[mode].label)}
                        </div>
                      </div>
                      <Battery value={st?.battery_pct ?? null} charging={st?.charging} />
                    </div>
                  );
                })}
            </div>
          );
        })}
        {Object.keys(fleets).length === 0 && <div className="empty">{zh ? "暂无车队，请先添加机器人。" : "No fleets yet. Register a robot to create one."}</div>}
      </div>
      <SimControls />
    </aside>
  );
}

function SimControls() {
  const [zh] = useLanguage();
  const sim = useWorld((s) => s.sim);
  const toast = useWorld((s) => s.toast);
  // These controls drive the core's built-in simulator only. With no robots on it (Gazebo,
  // Isaac Sim or hardware) they would control nothing, so they would only mislead.
  if (!sim || sim.robots.length === 0) return null;
  const act = async (path: string, label: string) => {
    try {
      await api.post(path);
      toast("info", label);
    } catch (e) {
      toast("error", errMsg(e));
    }
  };
  return (
    <div className="sim-box">
      <div className="row between">
        <span className="section-title">{zh ? "模拟运行" : "Simulation"}</span>
        <span className="badge" style={vars({ "--c": sim.running ? "#34d399" : "#fbbf24" })}>
          <span className={`dot${sim.running ? " pulse" : ""}`} style={vars({ "--c": sim.running ? "#34d399" : "#fbbf24" })} />
          {sim.running ? (zh ? "运行中" : "Running") : (zh ? "已暂停" : translateUI("Paused"))}
        </span>
      </div>
      <div className="faint" style={{ fontSize: 11.5 }}>
        {sim.environment} · {sim.robots.length} {zh ? "台模拟机器人" : translateUI("simulated robots")} · t={Math.round(sim.sim_time_s)} s
      </div>
      <div className="row">
        {sim.running ? (
          <button className="btn sm" onClick={() => act("/sim/pause", "Simulation paused")} title={translateUI("Pause")}>
            <Pause size={13} /> {zh ? "暂停" : translateUI("Pause")}
          </button>
        ) : (
          <button className="btn sm" onClick={() => act("/sim/start", "Simulation running")} title={translateUI("Start")}>
            <Play size={13} /> {zh ? "开始" : translateUI("Start")}
          </button>
        )}
        <button className="btn sm" onClick={() => act("/sim/stop", "Simulation stopped and reset")} title={translateUI("Stop: cancel sim tasks, return robots to spawn, pause")}>
          <Square size={12} /> {zh ? "停止" : translateUI("Stop")}
        </button>
        <button className="btn sm icon" onClick={() => act("/sim/reset", "Robots returned to spawn")} title={translateUI("Reset robots to spawn and keep running")}>
          <RotateCcw size={13} />
        </button>
        <select
          className="input"
          style={{ height: 24, width: 64, padding: "0 4px" }}
          value={sim.speed}
          onChange={(e) => api.patch("/sim", { speed: Number(e.target.value) }).catch((err) => toast("error", errMsg(err)))}
          title={translateUI("Simulation speed")}
        >
          {[0.5, 1, 2, 4, 8].map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
