const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(filename, requires = {}, globals = {}) {
  const source = fs.readFileSync(filename, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => {
    if (!(name in requires)) throw new Error("Unexpected import: " + name);
    return requires[name];
  }, ...globals });
  return exports;
}
const operational = load("src/lib/operationalTranslation.ts");
const { translateOperationalText: t } = operational;
test("simulated door events retain the device name", () => {
  assert.equal(t("DEVICE"), "设备");
  assert.equal(t("Simulated charger 桩A: charging started"), "模拟充电设备 桩A：充电已开始");
  assert.equal(t("T-0332 → waiting for traffic: Waiting for simulated door 456"), "任务 T-0332 → 等待交通通行：正在等待模拟门 456");
  assert.equal(t("Simulated door 456 requires recovery after task T-0331"), "模拟门 456 因任务 T-0331 中断需要恢复");
  assert.equal(t("Simulated door Door-002: status checked: closed before open"), "模拟门 Door-002：开门前检查状态：已关闭");
  assert.equal(t("Simulated door Door-002: already open"), "模拟门 Door-002：已打开，无需开门");
  assert.equal(t("Simulated door Door-002: open requested"), "模拟门 Door-002：开门请求");
  assert.equal(t("Simulated door Door-002: opened"), "模拟门 Door-002：开门成功");
  assert.equal(t("Simulated door Door-002: close requested"), "模拟门 Door-002：关门请求");
  assert.equal(t("Simulated door Door-002: closed"), "模拟门 Door-002：关门成功");
});
test("event categories and statuses have Chinese labels", () => {
  assert.equal(t("ROBOT_TASK_COMPLETED"), "机器人任务已完成");
  assert.equal(t("TRAFFIC_DEADLOCK"), "交通死锁");
  assert.equal(t("TASK_STATUS_CHANGED"), "任务状态已更改");
});
test("task and robot messages preserve names, identifiers and duration", () => {
  assert.equal(t("UAV-03 completed T-0056 in 32 s"), "UAV-03 已完成任务 T-0056，耗时 32 秒");
  assert.equal(t("UAV-03 arrived at My Loading Bay"), "UAV-03 已到达 My Loading Bay");
  assert.equal(t("T-0056 (land) assigned to UAV-03"), "任务 T-0056（降落）已分配给 UAV-03");
  assert.equal(t("T-0056 created: land: Fly to nearest free pad"), "已创建任务 T-0056：降落：飞往最近的空闲停机坪");
});
test("allocation failures and delivery event descriptions are translated", () => {
  const reason = "No robot can perform this task: Quadruped-04 — lacks capability carry_payload.";
  assert.equal(t(reason), "没有机器人能够执行此任务：Quadruped-04：缺少运载货物能力。");
  assert.equal(t(`T-0106 failed: ${reason}`), "任务 T-0106 执行失败：没有机器人能够执行此任务：Quadruped-04：缺少运载货物能力。");
  assert.equal(t("T-0106 created: deliver payload from Storage to Receiving"), "已创建任务 T-0106：配送载荷：从 Storage 运送至 Receiving");
  assert.equal(t("T-0107 is waiting for a robot: Waiting for a robot: UGV-01 — is offline."), "任务 T-0107 正在等待可用机器人：正在等待可用机器人：UGV-01：当前离线。");
  assert.equal(t("No robots registered in fleet warehouse_fleet."), "车队 warehouse_fleet中尚未注册机器人。");
});
test("common event descriptions translate while preserving names and measurements", () => {
  const cases = [
    ["Robot 'tsingbot01' registered in fleet '清湛车队'", "机器人“tsingbot01”已注册到车队“清湛车队”"],
    ["Fleet '清湛车队' (ugv) created", "车队“清湛车队”（地面机器人）已创建"],
    ["UAV-01 connected (simulation)", "UAV-01 已连接（模拟）"],
    ["Potential same-lane conflict between UAV-01 and UAV-02 at Westbound 12 m in ≈7 s", "预计约 7 秒后，UAV-01 与 UAV-02 在 Westbound 12 m 发生同车道冲突"],
    ["UGV-02 and Humanoid-01 were blocking each other; planned jointly so both can proceed", "UGV-02 与 Humanoid-01 相互阻挡；已联合规划路线，使双方都能通行"],
    ["Humanoid-03 re-routed by traffic negotiation: North Aisle 4 → Receiving Bay 3", "Humanoid-03 经交通协商重新规划路线：North Aisle 4 → Receiving Bay 3"],
    ["Simulation reset: robots returned to spawn poses", "模拟已重置：机器人已返回初始位置"],
    ["Seeded scenario 'warehouse_demo': 2 maps, 5 fleets, 17 robots", "已载入场景“warehouse_demo”：2 张地图、5 个车队、17 台机器人"],
  ];
  for (const [source, expected] of cases) assert.equal(t(source), expected, source);
});
test("task details, allocation explanations and safety messages are translated", () => {
  const cases = [
    ["Selected UGV-02: ≈38 s to Loading Dock 2, battery 95%, idle, traffic ≈8 s.", "已选择 UGV-02：预计 38 秒到达 Loading Dock 2，电量 95%，当前空闲，交通等待约 8 秒。"],
    ["Selected UAV-01: ≈0 s to Drone Pad 1, battery 97%, idle. Next best UAV-04 (cost ≈1 s vs ≈0 s). Not eligible: Quadruped-01 — lacks capability charge; Quadruped-02 — lacks capability charge (+5 more).", "已选择 UAV-01：预计 0 秒到达 Drone Pad 1，电量 97%，当前空闲；次优为 UAV-04（预计耗时 1 秒，对比 0 秒）；不符合条件：Quadruped-01：缺少充电能力；Quadruped-02：缺少充电能力；另有 5 台机器人。"],
    ["Completed by UGV-02", "已由 UGV-02 完成"],
    ["Created by ui via operator (tool dock_robot)", "由 ui 通过 operator 创建（工具 dock_robot）"],
    ["Re-joining the route network at Narrow Corridor South", "正在 Narrow Corridor South 重新接入路线网络"],
    ["route blocked by UAV-02 at Receiving corridor", "路线被 UAV-02 占用，位置：Receiving corridor"],
    ["waiting for UGV-04 to make way at Storage Rack B", "正在等待 UGV-04 在 Storage Rack B 让行"],
    ["UGV-04 is working at South Aisle 3 (the only route); waiting for it to leave", "UGV-04 正在 South Aisle 3 作业（该位置为唯一通行路线），等待其离开"],
    ["EMERGENCY STOP UGV-01: Operator emergency stop", "紧急停止 UGV-01：操作员触发急停"],
    ["Emergency stop released on UGV-01", "UGV-01 的紧急停止已解除"],
    ["Humanoid-01 is parked at Corridor South, the only route of Quadruped-01", "Humanoid-01 停靠在 Corridor South，这是 Quadruped-01 的唯一通行路线"],
  ];
  for (const [source, expected] of cases) assert.equal(t(source), expected, source);
});
test("traffic messages preserve participants and place names", () => {
  assert.equal(t("UAV-03 waiting for UAV-04, which is on Bay A"), "UAV-03 等待 UAV-04（位于 Bay A）");
  assert.equal(t("waiting for UAV-04, which goes first through Bay A"), "等待 UAV-04 优先通过 Bay A");
  assert.equal(t("Potential head-on conflict between A and B at Gate 1 in ≈7 s"), "预计约 7 秒后，A 与 B 在 Gate 1 发生对向冲突");
  assert.equal(t("A delayed ≈1.2 s at Gate 1 to let B pass"), "A 在 Gate 1 等待约 1.2 秒，让 B 通行");
  assert.equal(t("Wait cycle between A, B; re-planning B"), "A, B 之间出现循环等待，正在为 B 重新规划");
});
test("route and status messages translate the framing without changing route names", () => {
  assert.equal(t("A route: Loading → Gate (ETA 13 s, +1.2 s for traffic)"), "A 的路线：Loading → Gate（预计 13 秒，交通协调增加 1.2 秒）");
  assert.equal(t("T-0037 → executing: Driving to Loading"), "任务 T-0037 → 执行中：正在前往 Loading");
  assert.equal(t("T-0037 → waiting for traffic: waiting for B, which is on Gate"), "任务 T-0037 → 等待交通通行：等待 B（位于 Gate）");
});
test("unknown messages and unsupported conflict types remain unchanged", () => {
  for (const original of ["Custom vendor alarm 123", "Potential unknown conflict between A and B at C in ≈3 s", "T-001 → custom: A", "站点 A"]) {
    assert.equal(t(original), original);
  }
});
test("language switch restores original English and preserves unknown text", () => {
  let value = null;
  const storage = { getItem: () => value, setItem: (_, v) => { value = v; } };
  const translations = load("src/lib/translations.ts");
  const document = { documentElement: { lang: "" } };
  const language = load("src/lib/language.ts", {
    react: { useSyncExternalStore: (_sub, get) => get() },
    "./operationalTranslation": operational,
    "./translations": translations,
  }, { localStorage: storage, document, window: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, Event: function() {} });
  assert.equal(language.translateUI("UAV-03 arrived at Bay"), "UAV-03 已到达 Bay");
  language.useLanguage()[1](false);
  assert.equal(language.translateUI("UAV-03 arrived at Bay"), "UAV-03 arrived at Bay");
  assert.equal(document.documentElement.lang, "en");
  language.useLanguage()[1](true);
  assert.equal(language.translateUI("UAV-03 arrived at Bay"), "UAV-03 已到达 Bay");
  assert.equal(language.translateUI("Vendor specific message"), "Vendor specific message");
  assert.equal(document.documentElement.lang, "zh-CN");
});

test("elapsed times and durations switch languages", () => {
  let chinese = true;
  const fmt = load("src/lib/format.ts", {"./language": {getChinese: () => chinese}});
  const now = Date.now() / 1000;
  assert.equal(fmt.ago(now - 12), "12 秒前");
  assert.equal(fmt.dur(73), "1 分 13 秒");
  chinese = false;
  assert.equal(fmt.ago(now - 12), "12 s ago");
  assert.equal(fmt.dur(73), "1 min 13 s");
});

test("registration workflow labels, capabilities and checks have Chinese translations", () => {
  const translations = load("src/lib/translations.ts");
  const language = load("src/lib/language.ts", {
    react: { useSyncExternalStore: (_sub, get) => get() },
    "./operationalTranslation": operational, "./translations": translations,
  }, { localStorage: {getItem: () => null}, document: {documentElement: {}}, window: {}, Event: function() {} });
  const expected = {
    "Identity": "身份信息", "Fleet": "车队", "Capabilities": "能力", "Navigation": "导航",
    "Physical": "物理参数", "Communication": "通信", "Connect": "连接",
    "Wheeled ground robot, AMR, tugger": "轮式地面机器人、AMR、牵引车",
    "Carry payload": "运载货物", "Length": "长度", "Width": "宽度", "Height": "高度",
    "Robot discovered": "已发现机器人", "Connection established": "连接已建立",
    "Battery telemetry available": "电池遥测可用", "Not implemented yet": "尚未实现",
    "lidar_2d": "二维激光雷达 (lidar_2d)",
  };
  for (const [en, zh] of Object.entries(expected)) assert.equal(language.translateUI(en), zh, en);
  assert.equal(language.translateUI("kinematic simulator spawned Forklift-01 at Bay A"), "运动学模拟器已在 Bay A 生成 Forklift-01");
  assert.equal(language.translateUI("operating on map 'warehouse_demo'"), "运行于地图“warehouse_demo”");
  assert.equal(language.translateUI("A robot with ID rob-01 already exists"), "机器人 ID rob-01 已存在");
  assert.equal(language.translateUI("unknown vendor diagnostic"), "unknown vendor diagnostic");
});
test("translated templates preserve user supplied values and switch back to English", () => {
  let value = null;
  const translations = load("src/lib/translations.ts");
  const language = load("src/lib/language.ts", {
    react: { useSyncExternalStore: (_sub, get) => get() },
    "./operationalTranslation": operational, "./translations": translations,
  }, { localStorage: {getItem: () => value, setItem: (_, v) => {value = v;}}, document: {documentElement: {}}, window: {dispatchEvent() {}}, Event: function() {} });
  const name = "Robot $& {id}";
  const pattern = "{name} is connected and ready for work";
  assert.equal(language.formatUI(pattern, {name}), name + " 已连接，可以接收任务");
  language.useLanguage()[1](false);
  assert.equal(language.formatUI(pattern, {name}), name + " is connected and ready for work");
  assert.equal(language.translateUI("lidar_2d"), "lidar_2d");
  language.useLanguage()[1](true);
  assert.equal(language.formatUI("{count} selected", {count: 3}), "已选择 3 台");
});

test("registration dialog renders its first step in Chinese and English", async () => {
  const { createServer } = await import("vite");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
  let selectedLanguage = "zh";
  globalThis.window = { location: { hash: "", origin: "http://localhost:8000" }, addEventListener() {}, removeEventListener() {} };
  globalThis.localStorage = { getItem: (key) => key === "nayantra-language" ? selectedLanguage : null, setItem() {} };
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
  try {
    const { RegisterWizard } = await server.ssrLoadModule("/src/components/RegisterWizard.tsx");
    const zh = renderToStaticMarkup(React.createElement(RegisterWizard));
    assert.match(zh, /身份信息/);
    assert.match(zh, /轮式地面机器人/);
    selectedLanguage = "en";
    const en = renderToStaticMarkup(React.createElement(RegisterWizard));
    assert.match(en, /Identity/);
    assert.match(en, /Wheeled ground robot/);
  } finally {
    await server.close();
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage;
  }
});

test("ROS connection diagnostics translate without altering interface identifiers", () => {
  assert.equal(t("nothing publishes /robot/odom — is the robot / simulator running with namespace '/robot'?"), "没有发布 /robot/odom；请检查机器人或模拟器是否以命名空间“/robot”运行");
  assert.equal(t("no Nav2 action server at /robot/navigate_to_pose — is Nav2 running and active?"), "在 /robot/navigate_to_pose 未找到 Nav2 动作服务；请检查 Nav2 是否运行并已激活");
  assert.equal(t("node /nayantra_core, ROS_DOMAIN_ID=42"), "节点 /nayantra_core，ROS_DOMAIN_ID=42");
});

test("brand identity uses the company mark and bilingual product name", () => {
  const crypto = require("node:crypto");
  const shell = fs.readFileSync("src/components/Shell.tsx", "utf8");
  const logo = fs.readFileSync("src/components/Logo.tsx", "utf8");
  const index = fs.readFileSync("index.html", "utf8");
  assert.match(shell, /清湛灵枢/);
  assert.match(shell, /QZ LingShu/);
  assert.match(logo, /qingzhan-mark\.png/);
  assert.match(index, /清湛灵枢 | 多机器人调度系统/);
  assert.match(index, /rel="icon" type="image\/png" sizes="260x260" href="\/qingzhan-mark\.png\?v=20261116"/);
  assert.match(index, /rel="shortcut icon" type="image\/png" href="\/qingzhan-mark\.png\?v=20261116"/);
  assert.match(index, /rel="apple-touch-icon" sizes="260x260" href="\/qingzhan-mark\.png\?v=20261116"/);
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync("public/qingzhan-mark.png")).digest("hex"), "3c685150c1501b0cb0f9a3645156464464a643aa64f57cb6fd2de27a82401fca");
  assert.equal(t("Nayantra core restarted while this task was open; re-submit it"), "任务未完成时，清湛灵枢核心服务已重启，请重新提交任务");
});

test("3D legend and grid spacing switch languages without changing values", () => {
  let value = null;
  const storage = { getItem: () => value, setItem: (_, v) => { value = v; } };
  const language = load("src/lib/language.ts", {
    react: { useSyncExternalStore: (_sub, get) => get() },
    "./operationalTranslation": operational,
    "./translations": load("src/lib/translations.ts"),
  }, { localStorage: storage, document: { documentElement: { lang: "" } }, window: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, Event: function() {} });
  assert.equal(language.translateUI("3D legend"), "三维图例");
  assert.equal(language.translateUI("Route colors match robot label borders"), "路线颜色与机器人名称边框一致");
  assert.equal(language.formatUI("Grid spacing: {distance} m", { distance: 2 }), "网格间距：2 米");
  language.useLanguage()[1](false);
  assert.equal(language.translateUI("3D legend"), "3D legend");
  assert.equal(language.translateUI("Route colors match robot label borders"), "Route colors match robot label borders");
  assert.equal(language.formatUI("Grid spacing: {distance} m", { distance: 2 }), "Grid spacing: 2 m");
});
