import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, ArchiveRestore, Bot, CheckCircle2, ChevronRight, Copy, Ellipsis, FolderArchive, ListChecks, MessageSquarePlus, Pencil, Pin, PinOff, Plus, RefreshCw, ShieldAlert, Sparkles, TrafficCone, Trash2, Users, Wrench, AlertTriangle } from "lucide-react";
import { api } from "../api/client";
import type { AgentArchive, AgentArchivePurpose, AgentMissionDetail, AgentMissionSummary, AgentStats } from "../api/types";
import { ChatPanel } from "../components/ChatPanel";
import { Modal, vars } from "../components/ui";
import { ago, isOpen } from "../lib/format";
import { translateUI, useLanguage } from "../lib/language";
import { useChat } from "../store/chat";
import { useWorld } from "../store/world";

interface AgentStatus {
  available: boolean;
  provider?: string;
  llm_configured?: boolean;
  detail?: string;
}

const EMPTY_STATS: AgentStats = {
  total_missions: 0, successful: 0, failed: 0, success_rate_pct: 0, avg_duration_ms: 0,
  top_tools: [], last_24h_total: 0, last_24h_failed: 0,
};

const ARCHIVE_PURPOSES: AgentArchivePurpose[] = ["general", "status_review", "task_dispatch", "traffic", "safety", "maintenance"];

function purposeLabel(purpose: AgentArchivePurpose, zh: boolean) {
  const labels: Record<AgentArchivePurpose, [string, string]> = {
    general: ["通用", "General"], status_review: ["状态巡检", "Status review"], task_dispatch: ["任务调度", "Task dispatch"],
    traffic: ["交通协调", "Traffic coordination"], safety: ["安全处置", "Safety response"], maintenance: ["维护诊断", "Maintenance diagnostics"],
  };
  return labels[purpose][zh ? 0 : 1];
}

export function AssistantPage() {
  const [zh] = useLanguage();
  const robots = useWorld((s) => s.robots);
  const states = useWorld((s) => s.states);
  const tasks = useWorld((s) => s.tasks);
  const alerts = useWorld((s) => s.alerts);
  const traffic = useWorld((s) => s.traffic);
  const confirmations = useWorld((s) => s.confirmations);
  const setPage = useWorld((s) => s.setPage);
  const restoreChat = useChat((s) => s.restore);
  const toast = useWorld((s) => s.toast);
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [history, setHistory] = useState<AgentMissionSummary[]>([]);
  const [archives, setArchives] = useState<AgentArchive[]>([]);
  const [stats, setStats] = useState<AgentStats>(EMPTY_STATS);
  const [query, setQuery] = useState("");
  const [archiveFilter, setArchiveFilter] = useState("all");
  const [editingMission, setEditingMission] = useState<AgentMissionSummary | null>(null);
  const [missionTitle, setMissionTitle] = useState("");
  const [missionArchiveId, setMissionArchiveId] = useState("");
  const [archiveManagerOpen, setArchiveManagerOpen] = useState(false);
  const [archiveDraft, setArchiveDraft] = useState<{ id?: string; name: string; purpose: AgentArchivePurpose } | null>(null);
  const [saving, setSaving] = useState(false);

  const refreshAgent = useCallback(async () => {
    try {
      setAgent(await api.get<AgentStatus>("/agent/status"));
    } catch {
      setAgent({ available: false, detail: "core unreachable" });
    }
  }, []);

  const refreshAudit = useCallback(async () => {
    const [missions, activity, archiveList] = await Promise.allSettled([
      api.get<AgentMissionSummary[]>("/agent/history", { limit: 60 }),
      api.get<AgentStats>("/agent/stats"),
      api.get<AgentArchive[]>("/agent/archives"),
    ]);
    if (missions.status === "fulfilled") setHistory(missions.value);
    if (activity.status === "fulfilled") setStats(activity.value);
    if (archiveList.status === "fulfilled") setArchives(archiveList.value);
  }, []);

  useEffect(() => {
    void refreshAgent();
    void refreshAudit();
    const refresh = () => void refreshAudit();
    const timer = window.setInterval(() => { void refreshAgent(); void refreshAudit(); }, 15000);
    window.addEventListener("nayantra-agent-mission-complete", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("nayantra-agent-mission-complete", refresh);
    };
  }, [refreshAgent, refreshAudit]);

  const summary = useMemo(() => ({
    robots: Object.keys(robots).length,
    online: Object.values(states).filter((state) => state.online).length,
    tasks: Object.values(tasks).filter((task) => isOpen(task.status)).length,
    alerts: Object.values(alerts).filter((alert) => alert.status === "active").length,
    waits: traffic.waits.length,
    confirmations: Object.values(confirmations).filter((item) => item.status === "pending" && item.expires_at * 1000 > Date.now()).length,
  }), [alerts, confirmations, robots, states, tasks, traffic.waits.length]);

  const suggestions = useMemo(() => [
    summary.alerts ? zh ? "分析当前告警，并给出按优先级排列的处置建议" : "Analyze the active alerts and recommend actions by priority" : null,
    summary.waits ? zh ? "解释当前交通等待的原因，并提出安全的疏解方案" : "Explain the current traffic waits and propose a safe resolution" : null,
    summary.tasks ? zh ? "汇总正在执行的任务，指出可能延期的任务" : "Summarize active tasks and identify any at risk of delay" : null,
    zh ? "总结当前车队状态，并建议下一步重点关注事项" : "Summarize the fleet state and recommend the next operational focus",
  ].filter((item): item is string => Boolean(item)), [summary.alerts, summary.tasks, summary.waits, zh]);

  const filteredHistory = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return history.filter((item) => {
      const archiveMatches = archiveFilter === "all" || (archiveFilter === "unarchived" ? !item.archive_id : item.archive_id === archiveFilter);
      const textMatches = !needle || `${item.title ?? ""} ${item.command} ${item.summary}`.toLowerCase().includes(needle);
      return archiveMatches && textMatches;
    });
  }, [archiveFilter, history, query]);

  const ready = Boolean(agent?.available && agent.llm_configured !== false);
  const statusText = ready
    ? zh ? "AI 服务在线" : "AI service online"
    : agent?.available ? zh ? "未配置模型" : "Model not configured"
    : zh ? "AI 助手不可用" : "AI agent unavailable";

  const restoreMission = async (id: string) => {
    try {
      const mission = await api.get<AgentMissionDetail>(`/agent/history/${encodeURIComponent(id)}`);
      const restored = restoreChat({
        command: mission.command,
        steps: mission.steps.map((step) => ({ index: step.step_index, tool: step.tool, status: step.status, error: step.error, summary: step.error ?? "" })),
        answer: { text: mission.summary, ok: Boolean(mission.success) },
        at: mission.created_at * 1000,
      });
      toast(restored ? "success" : "warning", restored ? zh ? "已恢复历史对话" : "Conversation restored" : zh ? "请先等待当前 AI 操作完成" : "Wait for the current AI operation to finish");
    } catch {
      toast("error", zh ? "无法恢复该历史记录" : "Could not restore this conversation");
    }
  };

  const openMissionEditor = (mission: AgentMissionSummary) => {
    setEditingMission(mission);
    setMissionTitle(mission.title ?? "");
    setMissionArchiveId(mission.archive_id ?? "");
  };

  const saveMission = async () => {
    if (!editingMission) return;
    setSaving(true);
    try {
      await api.patch(`/agent/history/${encodeURIComponent(editingMission.id)}`, {
        title: missionTitle.trim() || null,
        archive_id: missionArchiveId || null,
      });
      await refreshAudit();
      setEditingMission(null);
      toast("success", zh ? "历史记录已更新" : "History updated");
    } catch {
      toast("error", zh ? "无法更新历史记录" : "Could not update history");
    } finally { setSaving(false); }
  };

  const toggleMissionPin = async (mission: AgentMissionSummary) => {
    setSaving(true);
    try {
      await api.patch(`/agent/history/${encodeURIComponent(mission.id)}`, { pinned: !Boolean(mission.pinned) });
      await refreshAudit();
      toast("success", Boolean(mission.pinned) ? zh ? "已取消置顶" : "Unpinned" : zh ? "已置顶" : "Pinned");
    } catch {
      toast("error", zh ? "无法更新置顶状态" : "Could not update pin status");
    } finally { setSaving(false); }
  };

  const assignMissionArchive = async (mission: AgentMissionSummary, archiveId: string | null) => {
    setSaving(true);
    try {
      await api.patch(`/agent/history/${encodeURIComponent(mission.id)}`, { archive_id: archiveId });
      await refreshAudit();
      toast("success", archiveId ? zh ? "已归档" : "Archived" : zh ? "已移回未归档" : "Moved to unfiled");
    } catch {
      toast("error", zh ? "无法更新归档" : "Could not update archive");
    } finally { setSaving(false); }
  };

  const copyMissionCommand = async (mission: AgentMissionSummary) => {
    try {
      await navigator.clipboard.writeText(mission.command);
      toast("success", zh ? "指令已复制" : "Command copied");
    } catch {
      toast("error", zh ? "无法复制指令" : "Could not copy command");
    }
  };

  const deleteMission = async (mission: AgentMissionSummary) => {
    const message = zh ? `确定删除“${mission.title || mission.command}”吗？此操作无法撤销。` : `Delete "${mission.title || mission.command}"? This cannot be undone.`;
    if (!window.confirm(message)) return;
    setSaving(true);
    try {
      await api.del(`/agent/history/${encodeURIComponent(mission.id)}`);
      await refreshAudit();
      toast("success", zh ? "历史记录已删除" : "History deleted");
    } catch {
      toast("error", zh ? "无法删除历史记录" : "Could not delete history");
    } finally { setSaving(false); }
  };

  const saveArchive = async () => {
    if (!archiveDraft?.name.trim()) return;
    setSaving(true);
    try {
      if (archiveDraft.id) await api.patch(`/agent/archives/${encodeURIComponent(archiveDraft.id)}`, { name: archiveDraft.name.trim(), purpose: archiveDraft.purpose });
      else await api.post("/agent/archives", { name: archiveDraft.name.trim(), purpose: archiveDraft.purpose });
      await refreshAudit();
      setArchiveDraft(null);
      toast("success", zh ? "档案已保存" : "Archive saved");
    } catch {
      toast("error", zh ? "无法保存档案" : "Could not save archive");
    } finally { setSaving(false); }
  };

  const deleteArchive = async (archive: AgentArchive) => {
    const message = zh ? `删除“${archive.name}”后，其中 ${archive.mission_count} 条历史记录会回到未归档。` : `Deleting "${archive.name}" returns its ${archive.mission_count} history records to Unfiled.`;
    if (!window.confirm(message)) return;
    setSaving(true);
    try {
      await api.del(`/agent/archives/${encodeURIComponent(archive.id)}`);
      if (archiveFilter === archive.id) setArchiveFilter("all");
      await refreshAudit();
      toast("success", zh ? "档案已删除，历史记录已保留" : "Archive deleted; history was retained");
    } catch {
      toast("error", zh ? "无法删除档案" : "Could not delete archive");
    } finally { setSaving(false); }
  };

  return (
    <div className="page assistant-page">
      <header className="assistant-page-head">
        <div>
          <div className="assistant-eyebrow"><Sparkles size={14} /> {zh ? "智能调度" : "INTELLIGENT OPERATIONS"}</div>
          <h1>{translateUI("AI Assistant")}</h1>
        </div>
        <div className="assistant-service" title={agent?.detail || statusText}>
          <span className="dot" style={vars({ "--c": ready ? "var(--ok)" : agent?.available ? "var(--warn)" : "var(--err)" })} />
          <span>{statusText}</span>
          {agent?.provider && <span className="assistant-provider">{agent.provider}</span>}
          <button className="btn ghost sm icon" onClick={() => { void refreshAgent(); void refreshAudit(); }} title={zh ? "刷新状态" : "Refresh status"} aria-label={zh ? "刷新状态" : "Refresh status"}>
            <RefreshCw size={13} />
          </button>
        </div>
      </header>

      <div className="assistant-layout">
        <aside className="panel assistant-history" aria-label={zh ? "AI 操作历史" : "AI activity history"}>
          <div className="panel-head">
            <span className="panel-title">{zh ? "历史记录" : "History"}</span>
            <span className="row" style={{ gap: 6 }}>
              <span className="faint num">{stats.total_missions}</span>
              <button className="btn ghost sm icon" onClick={() => setArchiveManagerOpen(true)} title={zh ? "管理档案" : "Manage archives"} aria-label={zh ? "管理档案" : "Manage archives"}><FolderArchive size={14} /></button>
            </span>
          </div>
          <div className="assistant-history-filter">
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={zh ? "搜索标题、指令或结果" : "Search titles, commands, or results"} aria-label={zh ? "搜索历史记录" : "Search history"} />
            <select className="input assistant-archive-filter" value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value)} aria-label={zh ? "筛选档案" : "Filter archive"}>
              <option value="all">{zh ? "全部历史记录" : "All history"}</option>
              <option value="unarchived">{zh ? "未归档" : "Unfiled"}</option>
              {archives.map((archive) => <option value={archive.id} key={archive.id}>{archive.name} ({archive.mission_count})</option>)}
            </select>
          </div>
          <div className="assistant-history-list">
            {filteredHistory.map((mission) => <MissionListItem key={mission.id} mission={mission} archives={archives} zh={zh} busy={saving} onRestore={restoreMission} onRename={openMissionEditor} onTogglePin={toggleMissionPin} onCopy={copyMissionCommand} onAssignArchive={assignMissionArchive} onDelete={deleteMission} />)}
            {!filteredHistory.length && <div className="assistant-history-empty">{query || archiveFilter !== "all" ? zh ? "没有匹配的历史记录" : "No matching history" : zh ? "暂无 AI 操作记录" : "No AI activity yet"}</div>}
          </div>
        </aside>

        <section className="panel assistant-chat-panel"><ChatPanel fullPage suggestions={suggestions} /></section>

        <aside className="assistant-context" aria-label={translateUI("Live context")}>
          <section className="panel assistant-context-panel">
            <div className="panel-head"><span className="panel-title">{translateUI("Live context")}</span><span className="faint num">{summary.robots}</span></div>
            <div className="assistant-stat-grid">
              <ContextLink icon={<Users size={15} />} label={translateUI("Online robots")} value={summary.online} color="var(--ok)" onClick={() => setPage("robots")} />
              <ContextLink icon={<ListChecks size={15} />} label={zh ? "进行中的任务" : "Open tasks"} value={summary.tasks} color="var(--info)" onClick={() => setPage("tasks")} />
              <ContextLink icon={<AlertTriangle size={15} />} label={translateUI("Alerts")} value={summary.alerts} color={summary.alerts ? "var(--warn)" : "var(--text-3)"} onClick={() => setPage("operations")} />
              <ContextLink icon={<TrafficCone size={15} />} label={translateUI("Traffic waits")} value={summary.waits} color={summary.waits ? "var(--warn)" : "var(--text-3)"} onClick={() => setPage("operations")} />
            </div>
          </section>

          <section className="panel assistant-context-panel">
            <div className="panel-head"><span className="panel-title">{zh ? "AI 运行概览" : "AI activity"}</span><Wrench size={15} style={{ color: "var(--accent-fg)" }} /></div>
            <div className="assistant-activity"><div><span>{zh ? "成功率" : "Success rate"}</span><strong className="num">{stats.success_rate_pct}%</strong></div><div><span>{zh ? "近 24 小时" : "Last 24h"}</span><strong className="num">{stats.last_24h_total}</strong></div></div>
            {stats.top_tools.length > 0 && <div className="assistant-tools">{stats.top_tools.map((tool) => <span key={tool.tool} className="mono">{tool.tool} <b>{tool.count}</b></span>)}</div>}
          </section>

          <section className="panel assistant-context-panel">
            <div className="panel-head"><span className="panel-title">{zh ? "确认队列" : "Confirmation queue"}</span><ShieldAlert size={15} style={{ color: summary.confirmations ? "var(--warn)" : "var(--text-3)" }} /></div>
            <div className="assistant-confirmation"><span className="assistant-confirmation-value">{summary.confirmations}</span><span className="muted">{zh ? "待操作员确认" : "Awaiting operator confirmation"}</span></div>
          </section>

          <section className="panel assistant-context-panel assistant-agent-panel">
            <div className="panel-head"><span className="panel-title">{zh ? "AI 服务" : "AI service"}</span>{ready ? <CheckCircle2 size={15} style={{ color: "var(--ok)" }} /> : <Bot size={15} style={{ color: "var(--text-3)" }} />}</div>
            <div className="assistant-agent-meta"><span>{agent?.provider || "—"}</span><span className={ready ? "assistant-ready" : "assistant-not-ready"}>{statusText}</span></div>
          </section>
        </aside>
      </div>

      {editingMission && <Modal title={zh ? "整理历史记录" : "Organize history"} onClose={() => setEditingMission(null)} size="sm" footer={<><button className="btn" onClick={() => setEditingMission(null)} disabled={saving}>{zh ? "取消" : "Cancel"}</button><button className="btn primary" onClick={() => void saveMission()} disabled={saving}>{zh ? "保存" : "Save"}</button></>}>
        <div className="assistant-modal-fields">
          <label>{zh ? "对话标题（留空则使用原指令）" : "Conversation title (blank uses the original command)"}<input className="input" value={missionTitle} onChange={(event) => setMissionTitle(event.target.value)} placeholder={editingMission.command} maxLength={120} autoFocus /></label>
          <label>{zh ? "归档位置" : "Archive"}<select className="input" value={missionArchiveId} onChange={(event) => setMissionArchiveId(event.target.value)}><option value="">{zh ? "未归档" : "Unfiled"}</option>{archives.map((archive) => <option key={archive.id} value={archive.id}>{archive.name} · {purposeLabel(archive.purpose, zh)}</option>)}</select></label>
        </div>
      </Modal>}

      {archiveManagerOpen && <Modal title={zh ? "管理历史档案" : "Manage history archives"} onClose={() => { setArchiveManagerOpen(false); setArchiveDraft(null); }} footer={<button className="btn" onClick={() => { setArchiveManagerOpen(false); setArchiveDraft(null); }}>{zh ? "关闭" : "Close"}</button>}>
        <div className="assistant-archive-manager">
          <div className="assistant-archive-actions"><span className="muted">{zh ? "档案用于组织 AI 对话，不会改变调度权限。" : "Archives organize AI conversations and do not change control permissions."}</span><button className="btn sm" onClick={() => setArchiveDraft({ name: "", purpose: "general" })} disabled={saving}><Plus size={14} /> {zh ? "新建档案" : "New archive"}</button></div>
          {archiveDraft && <div className="assistant-archive-form">
            <input className="input" value={archiveDraft.name} onChange={(event) => setArchiveDraft({ ...archiveDraft, name: event.target.value })} placeholder={zh ? "档案名称" : "Archive name"} maxLength={120} autoFocus />
            <select className="input" value={archiveDraft.purpose} onChange={(event) => setArchiveDraft({ ...archiveDraft, purpose: event.target.value as AgentArchivePurpose })}>{ARCHIVE_PURPOSES.map((purpose) => <option value={purpose} key={purpose}>{purposeLabel(purpose, zh)}</option>)}</select>
            <span className="assistant-archive-form-actions"><button className="btn ghost sm icon" onClick={() => setArchiveDraft(null)} title={zh ? "取消" : "Cancel"} aria-label={zh ? "取消" : "Cancel"}><Trash2 size={14} /></button><button className="btn primary sm" onClick={() => void saveArchive()} disabled={saving || !archiveDraft.name.trim()}>{zh ? "保存" : "Save"}</button></span>
          </div>}
          <div className="assistant-archive-list">
            {archives.map((archive) => <div className="assistant-archive-row" key={archive.id}>
              <Archive size={15} style={{ color: "var(--accent-fg)" }} /><div><strong>{archive.name}</strong><span>{purposeLabel(archive.purpose, zh)} · {archive.mission_count} {zh ? "条记录" : "records"}</span></div>
              <span className="assistant-archive-row-actions"><button className="btn ghost sm icon" onClick={() => setArchiveDraft({ id: archive.id, name: archive.name, purpose: archive.purpose })} disabled={saving} title={zh ? "编辑档案" : "Edit archive"} aria-label={zh ? "编辑档案" : "Edit archive"}><Pencil size={14} /></button><button className="btn ghost sm icon" onClick={() => void deleteArchive(archive)} disabled={saving} title={zh ? "删除档案" : "Delete archive"} aria-label={zh ? "删除档案" : "Delete archive"}><Trash2 size={14} /></button></span>
            </div>)}
            {!archives.length && !archiveDraft && <div className="assistant-history-empty">{zh ? "尚未创建档案" : "No archives yet"}</div>}
          </div>
        </div>
      </Modal>}
    </div>
  );
}

function MissionListItem({ mission, archives, zh, busy, onRestore, onRename, onTogglePin, onCopy, onAssignArchive, onDelete }: {
  mission: AgentMissionSummary; archives: AgentArchive[]; zh: boolean; busy: boolean; onRestore: (id: string) => void;
  onRename: (mission: AgentMissionSummary) => void; onTogglePin: (mission: AgentMissionSummary) => void; onCopy: (mission: AgentMissionSummary) => void;
  onAssignArchive: (mission: AgentMissionSummary, archiveId: string | null) => void; onDelete: (mission: AgentMissionSummary) => void;
}) {
  const success = Boolean(mission.success);
  const pinned = Boolean(mission.pinned);
  const [menuOpen, setMenuOpen] = useState(false);
  const [archivePickerOpen, setArchivePickerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setMenuOpen(false);
        setArchivePickerOpen(false);
      }
    };
    const closeOnLayoutChange = () => closeMenu();
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", closeOnLayoutChange);
    window.addEventListener("scroll", closeOnLayoutChange, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", closeOnLayoutChange);
      window.removeEventListener("scroll", closeOnLayoutChange, true);
    };
  }, [menuOpen]);

  const closeMenu = () => { setMenuOpen(false); setArchivePickerOpen(false); };
  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 228;
    const preferredHeight = 286;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    setMenuPosition({
      top: spaceBelow >= 180 ? rect.bottom + 5 : Math.max(8, rect.top - preferredHeight),
      left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width)),
    });
    setArchivePickerOpen(false);
    setMenuOpen(true);
  };

  return <div className="assistant-history-item">
    <button type="button" className="assistant-history-restore" onClick={() => void onRestore(mission.id)} title={zh ? "恢复并继续对话" : "Restore and continue this conversation"}>
      <span className="assistant-history-status" style={{ color: success ? "var(--ok)" : "var(--err)" }}>{success ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}</span>
      <span className="assistant-history-copy"><strong>{mission.title || mission.command}</strong><span>{mission.summary || (zh ? "无摘要" : "No summary")}</span></span>
      <span className="assistant-history-meta"><span>{pinned && <i title={zh ? "已置顶" : "Pinned"}><Pin size={10} fill="currentColor" /></i>}{mission.archive_name ? <><Archive size={10} /> {mission.archive_name}</> : ago(mission.created_at)}</span><span>{mission.step_count} {zh ? "步" : "steps"}</span></span>
    </button>
    <div className="assistant-history-menu-wrap">
      <button ref={triggerRef} type="button" className="btn ghost sm icon assistant-history-menu-trigger" onClick={() => menuOpen ? closeMenu() : openMenu()} title={zh ? "管理记录" : "Manage record"} aria-label={zh ? "管理记录" : "Manage record"} aria-expanded={menuOpen}><Ellipsis size={16} /></button>
      {menuOpen && createPortal(<div ref={menuRef} className="assistant-history-menu" style={menuPosition} role="menu" aria-label={zh ? "历史记录操作" : "History actions"}>
        {!archivePickerOpen ? <>
          <button role="menuitem" onClick={() => { onRename(mission); closeMenu(); }}><Pencil size={16} /><span>{zh ? "重命名" : "Rename"}</span></button>
          <button role="menuitem" onClick={() => { onTogglePin(mission); closeMenu(); }} disabled={busy}>{pinned ? <PinOff size={16} /> : <Pin size={16} />}<span>{pinned ? zh ? "取消置顶" : "Unpin" : zh ? "置顶" : "Pin"}</span></button>
          <button role="menuitem" onClick={() => { void onCopy(mission); closeMenu(); }}><Copy size={16} /><span>{zh ? "复制指令" : "Copy command"}</span></button>
          <div className="assistant-history-menu-separator" />
          <button role="menuitem" onClick={() => { void onRestore(mission.id); closeMenu(); }}><MessageSquarePlus size={16} /><span>{zh ? "继续对话" : "Continue conversation"}</span></button>
          <button role="menuitem" onClick={() => setArchivePickerOpen(true)}><Archive size={16} /><span>{mission.archive_id ? zh ? "更改归档" : "Change archive" : zh ? "归档到…" : "Archive to…"}</span><ChevronRight className="assistant-history-menu-arrow" size={15} /></button>
          <div className="assistant-history-menu-separator" />
          <button role="menuitem" className="danger" onClick={() => { void onDelete(mission); closeMenu(); }} disabled={busy}><Trash2 size={16} /><span>{zh ? "删除记录" : "Delete record"}</span></button>
        </> : <>
          <button role="menuitem" className="assistant-history-menu-back" onClick={() => setArchivePickerOpen(false)}><ChevronRight size={16} /><span>{zh ? "选择归档位置" : "Choose archive"}</span></button>
          <div className="assistant-history-menu-separator" />
          <button role="menuitem" onClick={() => { onAssignArchive(mission, null); closeMenu(); }} disabled={busy}><ArchiveRestore size={16} /><span>{zh ? "移回未归档" : "Move to unfiled"}</span></button>
          {archives.map((archive) => <button role="menuitem" key={archive.id} className={mission.archive_id === archive.id ? "selected" : ""} onClick={() => { onAssignArchive(mission, archive.id); closeMenu(); }} disabled={busy}><Archive size={16} /><span>{archive.name}</span><small>{purposeLabel(archive.purpose, zh)}</small></button>)}
          {!archives.length && <div className="assistant-history-menu-empty">{zh ? "请先创建档案" : "Create an archive first"}</div>}
        </>}
      </div>, document.body)}
    </div>
  </div>;
}

function ContextLink({ icon, label, value, color, onClick }: { icon: React.ReactNode; label: string; value: number; color: string; onClick: () => void }) {
  return <button type="button" className="assistant-stat" onClick={onClick}><span className="assistant-stat-icon" style={{ color }}>{icon}</span><span className="assistant-stat-label">{label}</span><strong className="num">{value}</strong></button>;
}
