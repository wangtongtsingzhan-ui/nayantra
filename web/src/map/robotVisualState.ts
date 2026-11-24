import type { RobotState } from "../api/types";

export type RobotVisualState = "error" | "offline" | "charging" | "waiting" | "paused" | "acting" | "moving" | "idle";

/** 急停、故障与离线优先于充电和运动，避免状态光效产生误导。 */
export function robotVisualState(state: RobotState): RobotVisualState {
  if (state.e_stop || state.mode === "emergency_stop" || state.mode === "error") return "error";
  if (!state.online || state.mode === "offline") return "offline";
  if (state.charging || state.mode === "charging") return "charging";
  if (state.mode === "waiting") return "waiting";
  if (state.mode === "paused") return "paused";
  if (state.mode === "acting") return "acting";
  if (state.mode === "moving") return "moving";
  return "idle";
}
