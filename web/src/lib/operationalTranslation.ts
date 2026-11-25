// Translate known server-generated messages without changing IDs or user-defined names.
// Unrecognised text is returned unchanged.
const eventTypes: Record<string, string> = {
  ROBOT_REGISTERED: "机器人已注册", ROBOT_UPDATED: "机器人已更新", ROBOT_REMOVED: "机器人已移除",
  ROBOT_CONNECTED: "机器人已连接", ROBOT_DISCONNECTED: "机器人已断开", ROBOT_BATTERY_LOW: "机器人电量低",
  ROBOT_TASK_ASSIGNED: "机器人任务已分配", ROBOT_TASK_STARTED: "机器人任务已开始",
  ROBOT_TASK_COMPLETED: "机器人任务已完成", ROBOT_TASK_FAILED: "机器人任务失败",
  ROBOT_ARRIVED: "机器人已到达", ROBOT_ENTERED_RESTRICTED_ZONE: "机器人进入受限区域",
  FLEET_CREATED: "车队已创建", FLEET_UPDATED: "车队已更新", FLEET_REMOVED: "车队已移除",
  MAP_UPDATED: "地图已更新", TASK_CREATED: "任务已创建", TASK_STATUS_CHANGED: "任务状态已更改",
  TASK_UNASSIGNABLE: "任务无法分配", TRAFFIC_CONFLICT_DETECTED: "检测到交通冲突",
  TRAFFIC_CONFLICT_RESOLVED: "交通冲突已处理", TRAFFIC_WAIT: "等待交通通行",
  TRAFFIC_DEADLOCK: "交通死锁", ROUTE_PLANNED: "路线已规划", ROUTE_CHANGED: "路线已更改",
  NAVIGATION_FAILED: "导航失败", LOCALIZATION_LOST: "定位丢失", SAFETY_STOP: "安全停止",
  EMERGENCY_STOP: "紧急停止", EMERGENCY_STOP_RELEASED: "紧急停止已解除",
  CONFIRMATION_REQUESTED: "等待确认", CONFIRMATION_RESOLVED: "确认已处理",
  SIMULATION: "模拟", DEVICE: "设备", SYSTEM: "系统",
};

const states: Record<string, string> = {
  queued: "排队中", assigned: "已分配", planning: "规划中", executing: "执行中",
  paused: "已暂停", "waiting for traffic": "等待交通通行", "waiting for robot": "等待机器人",
  completed: "已完成", failed: "失败", cancelled: "已取消",
};
const taskTypes: Record<string, string> = {
  navigate: "导航", delivery: "配送", patrol: "巡逻", inspect: "巡检",
  charge: "充电", dock: "停靠", takeoff: "起飞", land: "降落", make_way: "让行",
};
const robotTypes: Record<string, string> = {
  ugv: "地面机器人", uav: "无人机", quadruped: "四足机器人", humanoid: "人形机器人", other: "其他类型机器人",
};
const capabilities: Record<string, string> = {
  navigate: "导航", carry_payload: "运载货物", pick: "取货", drop: "放货", dock: "停靠",
  charge: "充电", patrol: "巡逻", inspect: "巡检", follow: "跟随", manipulate: "操作物体",
  takeoff: "起飞", land: "降落",
};
const conflictTypes: Record<string, string> = {
  "head-on": "对向", intersection: "交叉路口", bottleneck: "瓶颈", following: "跟车",
  "same-lane": "同车道", destination: "目的地",
};
const exact: Record<string, string> = {
  "Fly to nearest free pad": "飞往最近的空闲停机坪",
  "Go to nearest free charger": "前往最近的空闲充电站",
  "Go to nearest free dock": "前往最近的空闲停靠点",
  "finishing the current lane before re-planning": "正在完成当前路段，之后重新规划",
  "no conflict-free route within the planning horizon": "在规划范围内没有无冲突路线",
  "Nayantra core restarted while this task was open; re-submit it": "任务未完成时，清湛灵枢核心服务已重启，请重新提交任务",
  "resolved": "已解决",
  "head-on": "对向", "intersection": "交叉路口", "bottleneck": "瓶颈", "following": "跟车",
};

function translateAllocationReason(text: string): string {
  let m: RegExpExecArray | null;
  m = /^lacks capability (.+)$/.exec(text);
  if (m) return `缺少${m[1].split(", ").map((c) => capabilities[c] ?? c).join("、")}能力`;
  m = /^is a[n]? ([a-z_]+), task needs a[n]? ([a-z_]+)$/.exec(text);
  if (m) return `类型为${robotTypes[m[1]] ?? m[1]}，任务要求${robotTypes[m[2]] ?? m[2]}`;
  m = /^operates on map '(.+)', task is on '(.+)'$/.exec(text);
  if (m) return `当前运行于地图“${m[1]}”，而任务位于地图“${m[2]}”`;
  m = /^payload ([0-9.]+) kg < ([0-9.]+) kg$/.exec(text);
  if (m) return `载荷能力 ${m[1]} 千克，小于任务要求的 ${m[2]} 千克`;
  m = /^no destination on the (ground|air) layer$/.exec(text);
  if (m) return `${m[1] === "ground" ? "地面" : "空中"}图层上没有可用目的地`;
  if (text === "is decommissioned") return "已停用";
  if (text === "is offline") return "当前离线";
  if (text === "has its emergency stop engaged") return "急停已触发";
  if (text === "is held by the operator (paused)") return "已由操作员暂停";
  m = /^is offline \((.+)\)$/.exec(text);
  if (m) return `当前离线（${translateOperationalText(m[1])}）`;
  m = /^queue is full \(([0-9]+) tasks\)$/.exec(text);
  if (m) return `任务队列已满（${m[1]} 项）`;
  m = /^battery ([0-9.]+)% − ≈([0-9.]+)% for this task is below the ([0-9.]+)% minimum$/.exec(text);
  if (m) return `电量 ${m[1]}%，预计任务消耗约 ${m[2]}%，将低于 ${m[3]}% 的最低电量要求`;
  m = /^no route from (.+) to (.+)$/.exec(text);
  if (m) return `没有从 ${m[1]} 到 ${m[2]} 的可行路线`;
  return translateOperationalText(text);
}

function translateCandidateList(text: string): string {
  let body = text;
  let more = "";
  const moreMatch = / \(\+(\d+) more\)$/.exec(body);
  if (moreMatch) {
    more = `；另有 ${moreMatch[1]} 台机器人`;
    body = body.slice(0, moreMatch.index);
  }
  const candidates = body.split("; ").map((entry) => {
    const candidate = /^(.+?) — (.+)$/.exec(entry);
    return candidate
      ? `${candidate[1]}：${translateAllocationReason(candidate[2])}`
      : translateAllocationReason(entry);
  });
  return `${candidates.join("；")}${more}`;
}

function translateEstimate(text: string): string {
  const detail = text.replace(/^nearest capable robot \((.+)\)$/, "$1");
  const m = /^≈([0-9.]+) s to (.+?), battery ([0-9.]+)%, (idle|free in ≈([0-9.]+) s)(?:, traffic ≈([0-9.]+) s)?$/.exec(detail);
  if (!m) return detail === "nearest capable robot" ? "距离最近且具备所需能力" : detail;
  return `预计 ${m[1]} 秒到达 ${m[2]}，电量 ${m[3]}%${m[4] === "idle" ? "，当前空闲" : `，约 ${m[5]} 秒后空闲`}${m[6] ? `，交通等待约 ${m[6]} 秒` : ""}`;
}

function translateAllocationSummary(text: string): string | null {
  let m = /^(No robot can perform this task|Waiting for a robot): (.+)$/.exec(text);
  if (m) {
    let body = m[2].replace(/\.$/, "");
    let more = "";
    const moreMatch = / \(\+(\d+) more\)$/.exec(body);
    if (moreMatch) {
      more = `；另有 ${moreMatch[1]} 台机器人`;
      body = body.slice(0, moreMatch.index);
    }
    const prefix = m[1] === "Waiting for a robot" ? "正在等待可用机器人" : "没有机器人能够执行此任务";
    return `${prefix}：${translateCandidateList(body)}${more}。`;
  }
  m = /^No robots registered in (.+)\.$/.exec(text);
  if (m) {
    const scope = m[1] === "any fleet" ? "任何车队" : m[1].replace(/^robot /, "机器人 ").replace(/^fleet /, "车队 ");
    return `${scope}中尚未注册机器人。`;
  }
  m = /^Selected (.+?): (.+)\.$/.exec(text);
  if (m) {
    let selected = m[2];
    let nextBest = "";
    let rejected = "";
    const rejectedAt = selected.indexOf(". Not eligible: ");
    if (rejectedAt >= 0) {
      rejected = selected.slice(rejectedAt + 16);
      selected = selected.slice(0, rejectedAt);
    }
    const nextAt = selected.indexOf(". Next best ");
    if (nextAt >= 0) {
      nextBest = selected.slice(nextAt + 12);
      selected = selected.slice(0, nextAt);
    }
    let result = `已选择 ${m[1]}：${translateEstimate(selected)}`;
    const next = /^(.+?) \(cost ≈([0-9.]+) s vs ≈([0-9.]+) s\)$/.exec(nextBest);
    if (next) result += `；次优为 ${next[1]}（预计耗时 ${next[2]} 秒，对比 ${next[3]} 秒）`;
    if (rejected) result += `；不符合条件：${translateCandidateList(rejected)}`;
    return result + "。";
  }
  return null;
}

export function translateOperationalText(text: string): string {
  const charger = /^Simulated charger (.+): (reserved|charging started|charging stopped|released)$/.exec(text);
  if (charger) {
    const actions: Record<string, string> = { reserved: "已预约", "charging started": "充电已开始", "charging stopped": "充电已停止", released: "已释放" };
    return `模拟充电设备 ${charger[1]}：${actions[charger[2]]}`;
  }
  if (text === "Waiting for an available simulated charger") return "等待可用的模拟充电设备";
  if (text === "No simulated charger device bound to the requested station") return "目标充电站点未绑定模拟充电设备";
  if (text === "No reachable compatible simulated charger") return "没有可到达且兼容的模拟充电设备";
  if (text === "Simulated charger fault") return "模拟充电设备故障";
  if (text === "Simulated charging did not start") return "模拟充电未启动";
  const waitingDoor = /^Waiting for simulated door (.+)$/.exec(text);
  if (waitingDoor) return `正在等待模拟门 ${waitingDoor[1]}`;
  const recoverDoor = /^Simulated door (.+) requires recovery after task (.+)$/.exec(text);
  if (recoverDoor) return `模拟门 ${recoverDoor[1]} 因任务 ${recoverDoor[2]} 中断需要恢复`;
  const faultDoor = /^Simulated door (.+) is faulted$/.exec(text);
  if (faultDoor) return `模拟门 ${faultDoor[1]} 发生故障`;
  const unknownDoor = /^Simulated door (.+) state (open|closed|opening|closing|unknown) unavailable; recovery required$/.exec(text);
  if (unknownDoor) {
    const statuses: Record<string, string> = { open: "已打开", closed: "已关闭", opening: "正在打开", closing: "正在关闭", unknown: "未知" };
    return `模拟门 ${unknownDoor[1]} 状态为${statuses[unknownDoor[2]]}，无法通行，请检查设备`;
  }
  const doorCheck = /^Simulated door (.+): status checked: (open|closed|opening|closing|unknown) before (open|close)$/.exec(text);
  if (doorCheck) {
    const statuses: Record<string, string> = { open: "已打开", closed: "已关闭", opening: "正在打开", closing: "正在关闭", unknown: "未知" };
    return `模拟门 ${doorCheck[1]}：${doorCheck[3] === "open" ? "开门" : "关门"}前检查状态：${statuses[doorCheck[2]]}`;
  }
  const doorAlready = /^Simulated door (.+): already (open|closed)$/.exec(text);
  if (doorAlready) return `模拟门 ${doorAlready[1]}：${doorAlready[2] === "open" ? "已打开，无需开门" : "已关闭，无需关门"}`;
  const door = /^Simulated door (.+): (open requested|opened|close requested|closed)$/.exec(text);
  if (door) {
    const actions: Record<string, string> = { "open requested": "开门请求", opened: "开门成功", "close requested": "关门请求", closed: "关门成功" };
    return `模拟门 ${door[1]}：${actions[door[2]]}`;
  }
  if (Object.hasOwn(eventTypes, text)) return eventTypes[text];
  if (Object.hasOwn(exact, text)) return exact[text];
  if (Object.hasOwn(states, text)) return states[text];
  if (Object.hasOwn(taskTypes, text)) return taskTypes[text];
  const allocation = translateAllocationSummary(text);
  if (allocation) return allocation;
  let m: RegExpExecArray | null;

  m = /^(T-[0-9]+) failed: (.+)$/.exec(text);
  if (m) return `任务 ${m[1]} 执行失败：${translateOperationalText(m[2])}`;
  m = /^(T-[0-9]+) is waiting for a robot: (.+)$/.exec(text);
  if (m) return `任务 ${m[1]} 正在等待可用机器人：${translateOperationalText(m[2])}`;
  m = /^Task (T-[0-9]+) failed$/.exec(text);
  if (m) return `任务 ${m[1]} 执行失败`;
  m = /^(T-[0-9]+) created: deliver (.+?) from (.+?) to (.+)$/.exec(text);
  if (m) return `已创建任务 ${m[1]}：配送${m[2] === "payload" ? "载荷" : `“${m[2]}”`}：从 ${m[3]} 运送至 ${m[4]}`;
  m = /^Completed by (.+)$/.exec(text);
  if (m) return `已由 ${m[1]} 完成`;
  if (text === "Simulation reset") return "模拟已重置";
  if (text === "Planning route") return "正在规划路线";
  if (text === "Operator emergency stop") return "操作员触发急停";
  m = /^Created by (.+?) via (.+?) from command '(.+)' \(tool (.+)\)$/.exec(text);
  if (m) return `由 ${m[1]} 通过 ${m[2]} 创建，命令：“${m[3]}”（工具 ${m[4]}）`;
  m = /^Created by (.+?) via (.+?) \(tool (.+)\)$/.exec(text);
  if (m) return `由 ${m[1]} 通过 ${m[2]} 创建（工具 ${m[3]}）`;
  m = /^Created by (.+?) via (.+)$/.exec(text);
  if (m) return `由 ${m[1]} 通过 ${m[2]} 创建`;
  m = /^Re-joining the route network at (.+)$/.exec(text);
  if (m) return `正在 ${m[1]} 重新接入路线网络`;
  if (text === "idle while airborne; returning to a pad") return "空中待命，正在返回停机坪";
  m = /^make way for (.+) at (.+)$/.exec(text);
  if (m) return `为 ${m[1]} 让行，位置：${m[2]}`;
  m = /^route blocked by (.+) at (.+)$/.exec(text);
  if (m) return `路线被 ${m[1]} 占用，位置：${m[2]}`;
  m = /^(.+?) is working at (.+?) \(the destination\); waiting for it to leave$/.exec(text);
  if (m) return `${m[1]} 正在 ${m[2]} 作业（该位置为目的地），等待其离开`;
  m = /^(.+?) is working at (.+?) \(the only route\); waiting for it to leave$/.exec(text);
  if (m) return `${m[1]} 正在 ${m[2]} 作业（该位置为唯一通行路线），等待其离开`;
  m = /^All destinations in (.+) are occupied; waiting for one to free up$/.exec(text);
  if (m) return `${m[1]} 中的所有目的地均被占用，正在等待可用位置`;
  m = /^waiting for (.+) to make way at (.+)$/.exec(text);
  if (m) return `正在等待 ${m[1]} 在 ${m[2]} 让行`;
  m = /^(.+?) is parked at (.+), the only route of (.+)$/.exec(text);
  if (m) return `${m[1]} 停靠在 ${m[2]}，这是 ${m[3]} 的唯一通行路线`;
  m = /^EMERGENCY STOP (.+?): (.+)$/.exec(text);
  if (m) return `紧急停止 ${m[1]}：${translateOperationalText(m[2])}`;
  m = /^Emergency stop released on (.+)$/.exec(text);
  if (m) return `${m[1]} 的紧急停止已解除`;
  m = /^(.+?) emergency stop$/.exec(text);
  if (m) return `${m[1]} 紧急停止`;
  m = /^(.+?) connected \((simulation|ros2|isaac_demo)\)$/.exec(text);
  if (m) return `${m[1]} 已连接（${({ simulation: "模拟", ros2: "ROS 2", isaac_demo: "Isaac 演示" } as Record<string, string>)[m[2]]}）`;
  m = /^Robot '(.+)' registered in fleet '(.+)'$/.exec(text);
  if (m) return `机器人“${m[1]}”已注册到车队“${m[2]}”`;
  m = /^Robot '(.+)' updated$/.exec(text);
  if (m) return `机器人“${m[1]}”已更新`;
  m = /^Robot '(.+)' removed from fleet (.+)$/.exec(text);
  if (m) return `机器人“${m[1]}”已从车队 ${m[2]} 移除`;
  m = /^Fleet '(.+)' \(([a-z_]+)\) created$/.exec(text);
  if (m) return `车队“${m[1]}”（${robotTypes[m[2]] ?? m[2]}）已创建`;
  m = /^Fleet '(.+)' updated$/.exec(text);
  if (m) return `车队“${m[1]}”已更新`;
  m = /^Fleet '(.+)' removed$/.exec(text);
  if (m) return `车队“${m[1]}”已移除`;
  m = /^Map '(.+)' (created|deleted)$/.exec(text);
  if (m) return `地图“${m[1]}”已${m[2] === "created" ? "创建" : "删除"}`;
  m = /^Waypoint '(.+)' (updated|deleted)$/.exec(text);
  if (m) return `路径点“${m[1]}”已${m[2] === "updated" ? "更新" : "删除"}`;
  m = /^Lane (.+) (closed|reopened)$/.exec(text);
  if (m) return `通道 ${m[1]} 已${m[2] === "closed" ? "关闭" : "重新开放"}`;
  m = /^Zone '(.+)' \(([a-z_-]+)\) added$/.exec(text);
  if (m) return `区域“${m[1]}”（${({ restricted: "限制区", no_fly: "禁飞区", fleet_boundary: "车队边界" } as Record<string, string>)[m[2]] ?? m[2]}）已添加`;
  m = /^Zone '(.+)' removed$/.exec(text);
  if (m) return `区域“${m[1]}”已移除`;
  m = /^Seeded scenario '(.+)': ([0-9]+) maps, ([0-9]+) fleets, ([0-9]+) robots$/.exec(text);
  if (m) return `已载入场景“${m[1]}”：${m[2]} 张地图、${m[3]} 个车队、${m[4]} 台机器人`;
  m = /^Nayantra core (.+) started: ([0-9]+) fleets, ([0-9]+) robots, ([0-9]+) maps$/.exec(text);
  if (m) return `清湛灵枢核心服务 ${m[1]} 已启动：${m[2]} 个车队、${m[3]} 台机器人、${m[4]} 张地图`;
  m = /^Simulation (running|paused)$/.exec(text);
  if (m) return `模拟${m[1] === "running" ? "运行中" : "已暂停"}`;
  if (text === "Simulation reset: robots returned to spawn poses") return "模拟已重置：机器人已返回初始位置";
  m = /^(.+?) battery ([0-9.]+)% \(minimum ([0-9.]+)%\)$/.exec(text);
  if (m) return `${m[1]} 电量为 ${m[2]}%（最低阈值 ${m[3]}%）`;
  m = /^(.+?) (?:connection test failed|lost connection): (.+)$/.exec(text);
  if (m) return `${m[1]}${text.includes("lost connection") ? "连接已断开" : "连接测试失败"}：${translateOperationalText(m[2])}`;
  m = /^(.+?) cannot reach (.+): (.+)$/.exec(text);
  if (m) return `${m[1]} 无法到达 ${m[2]}：${translateOperationalText(m[3])}`;
  m = /^(.+?) re-routed by traffic negotiation: (.+)$/.exec(text);
  if (m) return `${m[1]} 经交通协商重新规划路线：${m[2]}`;
  m = /^Potential (head-on|intersection|bottleneck|following|same-lane|destination) conflict between (.+?) and (.+?) at (.+) in ≈([0-9.]+) s$/.exec(text);
  if (m) return `预计约 ${m[5]} 秒后，${m[2]} 与 ${m[3]} 在 ${m[4]} 发生${conflictTypes[m[1]]}冲突`;
  m = /^(.+?) is parked at (.+), the destination of (.+)$/.exec(text);
  if (m) return `${m[1]} 停靠在 ${m[2]}，该位置是 ${m[3]} 的目的地`;
  m = /^(.+?) and (.+?) were blocking each other; planned jointly so both can proceed$/.exec(text);
  if (m) return `${m[1]} 与 ${m[2]} 相互阻挡；已联合规划路线，使双方都能通行`;
  m = /^(.+?) asked to move to (.+)$/.exec(text);
  if (m) return `已请求 ${m[1]} 移动至 ${m[2]}`;
  m = /^(.+?) has priority; re-planned (.+)$/.exec(text);
  if (m) return `${m[1]} 优先通行；已重新规划：${m[2].replace(/ \+([0-9.]+) s/g, "，增加 $1 秒")}`;
  m = /^Priority conflict: (.+?) \(priority ([0-9]+)\) and (.+)$/.exec(text);
  if (m) return `优先级冲突：${m[1]}（优先级 ${m[2]}）与 ${m[3]}`;
  m = /^(.+?) rerouted via (.+?)(?: \(\+([0-9.]+) s\))?$/.exec(text);
  if (m) return `${m[1]} 已改道，经由 ${m[2]}${m[3] ? `（增加 ${m[3]} 秒）` : ""}`;
  m = /^(.+?) re-planned \(\+([0-9.]+) s\)$/.exec(text);
  if (m) return `${m[1]} 已重新规划路线（增加 ${m[2]} 秒）`;
  m = /^(.+?) protective stop: (.+?) ([0-9.]+) m ahead \(stop zone ([0-9.]+) m\)$/.exec(text);
  if (m) return `${m[1]} 触发保护性停止：${m[2]} 位于前方 ${m[3]} 米（停止区域 ${m[4]} 米）`;

  m = /^(.+?) completed (T-[0-9]+)(?: in ([0-9.]+) s)?$/.exec(text);
  if (m) return m[1] + " 已完成任务 " + m[2] + (m[3] ? "，耗时 " + m[3] + " 秒" : "");
  m = /^(.+?) arrived at (.+)$/.exec(text);
  if (m) return m[1] + " 已到达 " + m[2];
  m = /^(T-[0-9]+) \(([^)]+)\) assigned to (.+)$/.exec(text);
  if (m) return "任务 " + m[1] + "（" + (taskTypes[m[2]] ?? m[2]) + "）已分配给 " + m[3];
  m = /^(.+?) started (T-[0-9]+) \(([^)]+)\)$/.exec(text);
  if (m) return m[1] + " 已开始任务 " + m[2] + "（" + (taskTypes[m[3]] ?? m[3]) + "）";
  m = /^(T-[0-9]+) created: ([a-z_]+): (.+)$/.exec(text);
  if (m) return "已创建任务 " + m[1] + "：" + (taskTypes[m[2]] ?? m[2]) + "：" + translateOperationalText(m[3]);
  m = /^(T-[0-9]+) → ([a-z ]+)(?:: (.+))?$/.exec(text);
  if (m && Object.hasOwn(states, m[2])) return "任务 " + m[1] + " → " + states[m[2]] + (m[3] ? "：" + translateOperationalText(m[3]) : "");
  m = /^(.+?) route: (.+) \(ETA ([0-9.]+) s(?:, \+([0-9.]+) s for traffic)?\)$/.exec(text);
  if (m) return m[1] + " 的路线：" + m[2] + "（预计 " + m[3] + " 秒" + (m[4] ? "，交通协调增加 " + m[4] + " 秒" : "") + "）";
  m = /^Potential (head-on|intersection|bottleneck|following) conflict between (.+?) and (.+?) at (.+) in ≈([0-9.]+) s$/.exec(text);
  if (m) return "预计约 " + m[5] + " 秒后，" + m[2] + " 与 " + m[3] + " 在 " + m[4] + " 发生" + conflictTypes[m[1]] + "冲突";
  m = /^(.+?) delayed ≈([0-9.]+) s at (.+?) to let (.+) pass$/.exec(text);
  if (m) return m[1] + " 在 " + m[3] + " 等待约 " + m[2] + " 秒，让 " + m[4] + " 通行";
  m = /^Wait cycle between (.+); re-planning (.+)$/.exec(text);
  if (m) return m[1] + " 之间出现循环等待，正在为 " + m[2] + " 重新规划";
  m = /^(?:(.+?) )?waiting for (.+?), which is on (.+)$/.exec(text);
  if (m) return (m[1] ? m[1] + " " : "") + "等待 " + m[2] + "（位于 " + m[3] + "）";
  m = /^(?:(.+?) )?waiting for (.+?), which goes first through (.+)$/.exec(text);
  if (m) return (m[1] ? m[1] + " " : "") + "等待 " + m[2] + " 优先通过 " + m[3];
  m = /^(Driving to|Proceeding to|Go to|Deliver to|Pick up|Drop off) (.+)$/.exec(text);
  if (m) {
    const verbs: Record<string, string> = { "Driving to": "正在前往", "Proceeding to": "继续前往", "Go to": "前往", "Deliver to": "配送至", "Pick up": "取货", "Drop off": "放货" };
    return verbs[m[1]] + " " + m[2];
  }
  m = /^Cancelled by (.+)$/.exec(text);
  if (m) return "已由 " + m[1] + " 取消";
  m = /^Charging ([0-9.]+)% → ([0-9.]+)%$/.exec(text);
  if (m) return "充电 " + m[1] + "% → " + m[2] + "%";
  m = /^kinematic simulator spawned (.+?) at (.+)$/.exec(text);
  if (m) return "运动学模拟器已在 " + m[2] + " 生成 " + m[1];
  m = /^operating on map '(.+)'$/.exec(text);
  if (m) return "运行于地图“" + m[1] + "”";
  m = /^(\\d+) publisher\\(s\\) on (.+)$/.exec(text);
  if (m) return m[2] + " 上有 " + m[1] + " 个发布者";
  m = /^receiving (.+)$/.exec(text);
  if (m) return "正在接收 " + m[1];
  m = /^no message on (.+) within 3 s$/.exec(text);
  if (m) return "3 秒内未收到 " + m[1] + " 的消息";
  m = /^no transform (.+); using odometry as map pose$/.exec(text);
  if (m) return "缺少坐标变换 " + m[1] + "；使用里程计作为地图位姿";
  m = /^could not create subscriptions\/clients: (.+)$/.exec(text);
  if (m) return "无法创建订阅或客户端：" + m[1];
  m = /^not supported by the (.+) adapter$/.exec(text);
  if (m) return m[1] + " 适配器不支持此操作";
  m = /^A robot with ID (.+) already exists$/.exec(text);
  if (m) return "机器人 ID " + m[1] + " 已存在";
  m = /^nothing publishes (.+) — is the robot \/ simulator running with namespace '(.+)'\?$/.exec(text);
  if (m) return "没有发布 " + m[1] + "；请检查机器人或模拟器是否以命名空间“" + m[2] + "”运行";
  m = /^no Nav2 action server at (.+) — is Nav2 running and active\?$/.exec(text);
  if (m) return "在 " + m[1] + " 未找到 Nav2 动作服务；请检查 Nav2 是否运行并已激活";
  m = /^isaac_demo control API at (.+)$/.exec(text);
  if (m) return "isaac_demo 控制接口：" + m[1];
  m = /^node \/nayantra_core, ROS_DOMAIN_ID=(.+)$/.exec(text);
  if (m) return "节点 /nayantra_core，ROS_DOMAIN_ID=" + m[1];
  return text;
}
