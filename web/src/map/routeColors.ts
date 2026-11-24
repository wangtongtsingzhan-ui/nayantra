// 相邻分配结果尽量使用不同色相，便于区分同时显示的路线。
const PALETTE = [
  "#20bfa9", "#eb609f", "#568df5", "#ed9544", "#a075e5", "#61ae49",
  "#e05f5f", "#33a3cc", "#c4922d", "#bc72ce", "#52a77d", "#ce6b3d",
  "#7b83d9", "#c76888", "#78a847", "#4895ad", "#b36ab5", "#b58551",
  "#43a4a0", "#d46e65", "#8872c6", "#9b9c40", "#4c82c0", "#a47b91",
];

/** 本次视图会话内保留颜色分配，机器人列表变化时不改变已有路线颜色。 */
export function assignRouteColors(ids: string[], assigned: Map<string, string>): Map<string, string> {
  for (const id of [...ids].sort()) {
    if (assigned.has(id)) continue;
    const index = assigned.size;
    // 超出固定调色板后继续沿色相环生成颜色，避免简单重复。
    const color = index < PALETTE.length ? PALETTE[index] : `hsl(${((index - PALETTE.length) * 137.508) % 360}, 65%, 48%)`;
    assigned.set(id, color);
  }
  return assigned;
}
