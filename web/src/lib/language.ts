import { useSyncExternalStore } from "react";
import { translateOperationalText } from "./operationalTranslation";
const key = "nayantra-language";
const eventName = "nayantra-language-change";
function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(eventName, callback);
    window.removeEventListener("storage", callback);
  };
}
export function getChinese() { return localStorage.getItem(key) !== "en"; }
export function useLanguage(): [boolean, (zh: boolean) => void] {
  const zh = useSyncExternalStore(subscribe, getChinese, () => true);
  return [zh, (value) => {
    localStorage.setItem(key, value ? "zh" : "en");
    document.documentElement.lang = value ? "zh-CN" : "en";
    window.dispatchEvent(new Event(eventName));
  }];
}

import { translations } from "./translations";
export function translateUI(text: string): string {
  if (!getChinese()) return text;
  if (translations[text]) return translations[text];
  const emergency = /^Emergency-stop the entire (.+)\?$/.exec(text);
  if (emergency) return `紧急停止车队“${emergency[1]}”的所有机器人？`;
  const stop = /^Stop every robot in (.+)\?$/.exec(text);
  if (stop) return `停止车队“${stop[1]}”中的所有机器人？`;
  const waypoint = /^Waypoint '(.+)' added at \(([^)]+)\)$/.exec(text);
  if (waypoint) return `已添加路径点“${waypoint[1]}”，位置（${waypoint[2]}）`;
  const connected = /^(.+) connected \(simulation\)$/.exec(text);
  if (connected) return `${connected[1]} 已连接（模拟）`;
  const rejected = /^Rejected by ui: (.+)$/.exec(text);
  if (rejected) return `操作界面已拒绝：${translateUI(rejected[1])}`;
  const requested = /^Confirmation needed: (.+) \(requested by ui\)$/.exec(text);
  if (requested) return `需要确认：${translateUI(requested[1])}（由操作界面请求）`;
  const start = /^Nayantra core (.+) started: (\d+) fleets, (\d+) robots, (\d+) maps$/.exec(text);
  if (start) return `清湛灵枢核心服务 ${start[1]} 已启动：${start[2]} 个车队、${start[3]} 台机器人、${start[4]} 张地图`;
  return translateOperationalText(text);
}

/** Format translated UI text without interpreting replacement values. */
export function formatUI(template: string, values: Record<string, string | number>): string {
  return translateUI(template).replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
