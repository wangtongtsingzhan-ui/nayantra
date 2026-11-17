import { translateUI } from "../lib/language";
import { useState } from "react";
import { useLanguage } from "../lib/language";
import {
  AlertTriangle, Bot, CheckCircle2, CircleAlert, Info, LayoutDashboard, ListChecks, Map as MapIcon, Moon, OctagonX,
  Sparkles,
  Server, ShieldAlert, Sun, Users,
} from "lucide-react";
import { api, isConfirmation } from "../api/client";
import { type Page, useWorld } from "../store/world";
import { ago, errMsg } from "../lib/format";
import { Logo } from "./Logo";
import { Modal, vars } from "./ui";

const PAGES: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "operations", label: "Operations", icon: <LayoutDashboard size={14} /> },
  { id: "assistant", label: "AI Assistant", icon: <Sparkles size={14} /> },
  { id: "fleets", label: "Fleets", icon: <Users size={14} /> },
  { id: "robots", label: "Robots", icon: <Bot size={14} /> },
  { id: "tasks", label: "Tasks", icon: <ListChecks size={14} /> },
  { id: "map", label: "Map editor", icon: <MapIcon size={14} /> },
  { id: "system", label: "System", icon: <Server size={14} /> },
];

export function TopBar() {
  const [zh, setZh] = useLanguage();
  const page = useWorld((s) => s.page);
  const setPage = useWorld((s) => s.setPage);
  const connected = useWorld((s) => s.connected);
  const theme = useWorld((s) => s.theme);
  const setTheme = useWorld((s) => s.setTheme);
  const alerts = useWorld((s) => s.alerts);
  const toast = useWorld((s) => s.toast);
  const active = Object.values(alerts).filter((a) => a.status === "active");
  const critical = active.some((a) => a.severity === "critical" || a.severity === "error");
  const labels: Record<Page, string> = zh
    ? { operations: "调度", assistant: "AI 助手", fleets: "车队", robots: "机器人", tasks: "任务", map: "地图编辑", system: "系统" }
    : Object.fromEntries(PAGES.map((item) => [item.id, item.label])) as Record<Page, string>;
  return (
    <header className="topbar">
      <div className="brand">
        <Logo size={34} />
        <div className="brand-label">
          <strong>{zh ? "清湛灵枢" : "QZ LingShu"}</strong>
          <span>{zh ? "清湛智造 · 多机器人调度系统" : "Qingzhan Robotics · Multi-Robot Dispatch"}</span>
        </div>
      </div>
      <nav className="nav">
        {PAGES.map((p) => (
          <button key={p.id} className={page === p.id ? "active" : ""} onClick={() => setPage(p.id)} title={labels[p.id]} aria-label={labels[p.id]}>
            {p.icon} <span className="nav-label">{labels[p.id]}</span>
          </button>
        ))}
      </nav>
      <div className="spacer" />
      {active.length > 0 && (
        <span className="badge" style={vars({ "--c": critical ? "#f87171" : "#fbbf24" })} title={active.map((a) => a.title).join("\n")}>
          <AlertTriangle size={12} /> {active.length} {translateUI("alert")}{!zh && active.length > 1 ? "s" : ""}
        </span>
      )}
      <span className="conn">
        <span className={`dot${connected ? "" : " pulse"}`} style={vars({ "--c": connected ? "#34d399" : "#f87171" })} />
        {connected ? (zh ? "已连接" : "Live") : (zh ? "重新连接中…" : "Reconnecting…")}
      </span>
      <button type="button" className="btn sm" onClick={() => setZh(!zh)} title="切换语言 / Switch language">{zh ? "English" : "中文"}</button>
      <button
        type="button"
        role="switch"
        aria-checked={theme === "dark"}
        aria-label={translateUI("Dark mode")}
        className="theme-switch"
        title={theme === "dark" ? translateUI("Dark mode — switch to light") : translateUI("Light mode — switch to dark")}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <span className="knob" />
        <Sun className="ico sun" />
        <Moon className="ico moon" />
      </button>
      <button
        className="estop small"
        title={translateUI("Emergency-stop every robot (asks for confirmation)")}
        onClick={async () => {
          try {
            const r = await api.post("/robots/estop-all", { reason: "Global E-STOP from the top bar" });
            if (!isConfirmation(r)) toast("error", "Unexpected response");
          } catch (e) {
            toast("error", errMsg(e));
          }
        }}
      >
        <OctagonX size={14} /> {zh ? "全部急停" : translateUI("E-STOP ALL")}
      </button>
    </header>
  );
}

/** Every dangerous action (from the UI or the LLM) lands here for an explicit decision. */
export function ConfirmDialog() {
  const [zh] = useLanguage();
  const confirmations = useWorld((s) => s.confirmations);
  const toast = useWorld((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const pending = Object.values(confirmations)
    .filter((c) => c.status === "pending" && c.expires_at * 1000 > Date.now())
    .sort((a, b) => a.created_at - b.created_at);
  const c = pending[0];
  if (!c) return null;
  const decide = async (confirm: boolean) => {
    setBusy(true);
    try {
      const r = await api.post<{ status: string; result?: { error?: string } }>(`/confirmations/${c.id}/${confirm ? "confirm" : "reject"}`);
      if (confirm) {
        if (r.status === "executed") toast("success", `Done: ${c.summary}`);
        else toast("error", `Failed: ${r.result?.error ?? r.status}`);
      }
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const fromLLM = c.requested_by === "mcp" || c.trace?.source === "llm";
  const estop = c.kind === "estop_all";
  return (
    <Modal
      size="sm"
      title={<span className="row"><ShieldAlert size={16} style={{ color: "var(--warn)" }} /> {translateUI("Confirmation required")}</span>}
      onClose={() => void decide(false)}
      footer={
        <>
          <span className="faint" style={{ fontSize: 12 }}>{pending.length > 1 ? zh ? `另有 ${pending.length - 1} 项待确认` : `${pending.length - 1} more waiting` : zh ? `有效期至 ${new Date(c.expires_at * 1000).toLocaleTimeString("zh-CN")}` : `expires ${ago(c.expires_at).replace(" ago", "")}`}</span>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => void decide(false)}>{translateUI("Cancel")}</button>
            {estop ? (
              <button className="estop" disabled={busy} onClick={() => void decide(true)}><OctagonX size={14} /> {translateUI("Confirm")}</button>
            ) : (
              <button className="btn primary" disabled={busy} onClick={() => void decide(true)}>{translateUI("Confirm")}</button>
            )}
          </div>
        </>
      }
    >
      <div className="col" style={{ gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{translateUI(c.summary)}</div>
        {c.detail && <div className="muted">{translateUI(c.detail)}</div>}
        <div className="reason" style={vars({ "--c": fromLLM ? "#a78bfa" : "#60a5fa" })}>
          {translateUI("Requested by")}{" "}<b>{fromLLM ? translateUI("the AI agent") : c.requested_by}</b>
          {c.trace?.command ? <> {translateUI("for the command “")}{c.trace.command}”</> : null}
          {c.trace?.tool ? <> {translateUI("via tool")}{" "}<span className="mono">{c.trace.tool}</span></> : null}{translateUI(". Nothing happens unless you confirm.")}{" "}</div>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useWorld((s) => s.toasts);
  const dismiss = useWorld((s) => s.dismissToast);
  const icon = { info: <Info size={14} />, success: <CheckCircle2 size={14} />, warning: <AlertTriangle size={14} />, error: <CircleAlert size={14} /> };
  const color = { info: "var(--info)", success: "var(--ok)", warning: "var(--warn)", error: "var(--err)" };
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast glass" onClick={() => dismiss(t.id)} style={{ borderLeft: `3px solid ${color[t.kind]}` }}>
          <span style={{ color: color[t.kind], display: "inline-flex" }}>{icon[t.kind]}</span>
          {translateUI(t.text)}
        </div>
      ))}
    </div>
  );
}
