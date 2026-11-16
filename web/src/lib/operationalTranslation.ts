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
  SIMULATION: "模拟", SYSTEM: "系统",
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
const conflictTypes: Record<string, string> = {
  "head-on": "对向", intersection: "交叉路口", bottleneck: "瓶颈", following: "跟车",
};
const exact: Record<string, string> = {
  "Fly to nearest free pad": "飞往最近的空闲停机坪",
  "Go to nearest free charger": "前往最近的空闲充电站",
  "Go to nearest free dock": "前往最近的空闲停靠点",
  "finishing the current lane before re-planning": "正在完成当前路段，之后重新规划",
  "no conflict-free route within the planning horizon": "在规划范围内没有无冲突路线",
  "Nayantra core restarted while this task was open; re-submit it": "任务未完成时核心服务重启，请重新提交任务",
  "resolved": "已解决",
  "head-on": "对向", "intersection": "交叉路口", "bottleneck": "瓶颈", "following": "跟车",
};

export function translateOperationalText(text: string): string {
  if (Object.hasOwn(eventTypes, text)) return eventTypes[text];
  if (Object.hasOwn(exact, text)) return exact[text];
  if (Object.hasOwn(states, text)) return states[text];
  if (Object.hasOwn(taskTypes, text)) return taskTypes[text];
  let m: RegExpExecArray | null;

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
