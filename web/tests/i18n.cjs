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
