# 系统参数与现有配置入口清单

本清单依据当前代码整理，供后续设计参数配置页面。这里区分**已有参数**、**现有界面/API 的入口**和**写在代码中的常量**；不表示所有参数都已经可以在页面上修改。文中默认值指代码默认值，并非读取本机 `.env` 后的实际值；示例场景、数据库配置和启动参数可能覆盖它们。本次未读取本地密钥，也未修改运行配置。

## 1. 配置来源和作用范围

| 来源 | 内容 | 当前生效方式 | 界面现状 |
| --- | --- | --- | --- |
| 启动环境变量、`.env` | 服务地址、端口、认证、模型、数据库等，定义于 `nayantra/config.py` | 由各进程启动时加载；修改后通常需重启相关服务。进程环境、两个 dotenv 文件及命令行覆盖需按实际启动方式核实 | 系统页面主要展示状态；没有统一编辑页面 |
| Core 数据库 | 地图、车队、机器人、设备、任务等 | 通过 Core API 更新并持久化；车队/机器人变更通知运行时重新配置，具体字段对正在执行任务的影响需验证 | 部分配置分散在车队、机器人和地图编辑页 |
| 场景 JSON | 首次初始化用的地图、车队和机器人 | `NAYANTRA_SCENARIO` 在数据库为空时导入；修改 JSON 不会自动覆盖已有数据库 | 没有场景参数编辑器；不可为修改配置而重置用户数据 |
| 模拟器运行状态 | 运行/暂停、速度 | API 和操作界面即时修改，进程级状态；不要假定重启后保留 | 主页左下角 |
| 浏览器偏好 | 中英文、主题、地图、图层、聊天面板等 | localStorage，按浏览器保存 | 界面已有切换，不是服务器全局配置 |
| 源码常量 | 交通、任务分配、安全阈值、控制周期等 | 修改代码并重启/重新构建；目前不是公开配置 | 无入口 |

机器人参数存在继承：车队提供默认能力、导航、外形、速度、通信和电池策略，机器人部分属性可覆盖；最终使用值见 `WorldRegistry.effective_config()` 和机器人 API 的 `effective`。特别是电池阈值目前来自车队电池策略，不是每台机器人分别配置的阈值。保存嵌套对象前应核对 API 的合并行为和未提交字段，避免意外覆盖。

## 2. 调度业务参数

### 2.1 车队与电量

| 参数（字段） | 作用 / 代码默认值 | 当前入口 |
| --- | --- | --- |
| 车队名称、描述、颜色、地图、能力、优先级 `priority` | 优先级 0–9，默认 5；决定车队默认属性和交通协商 | 车队页面创建/编辑；`POST/PATCH /api/v1/fleets` |
| `charging_required` | 低电量自动充电策略开关，默认 true；自动任务还需机器人有充电能力、地图有绑定的模拟充电设备、机器人满足执行条件 | 注册机器人时创建车队可设置；已有车队可通过车队编辑窗口或 `PATCH /api/v1/fleets/{id}` 修改 |
| `battery.min_pct` | 最低电量阈值，默认 20%，用于低电量告警及非充电任务分配的电量估计 | 车队详情显示；车队编辑窗口及 PATCH API 可修改 |
| `battery.recharge_pct` | 空闲机器人低于此值触发自动充电，默认 30%，范围 0–100% | 车队编辑窗口及 PATCH API；注意已经在绑定充电设备的站点空闲时，存在按目标电量补电的独立逻辑 |
| `battery.charged_pct` | 模拟充电目标电量，默认 95%，范围 0–100% | 车队编辑窗口及 PATCH API |
| `battery.capacity_wh` | 车队默认电池容量，正数或未指定 | 车队 PATCH API；机器人编辑可设置机器人容量字段；须区分显示/继承和实际耗电模型 |
| `battery.charge_rate_pct_per_min` | 模拟每分钟充电百分比，默认 12 | 车队 PATCH API，无完整界面 |
| `battery.drain_pct_per_min_idle`、`drain_pct_per_m` | 模拟空闲和行驶耗电，默认 0.1%/分钟、0.05%/米 | 车队 PATCH API，无完整界面 |

当前低电量触发不会中断已有任务；手动取消充电后该机器人在当前 Core 进程中暂停自动充电，再次手动发起充电或服务重启后恢复。实际现场阈值和充电兼容性需要验证。API 对电池阈值分别做范围校验；车队编辑窗口额外校验最低电量不高于回充阈值、回充阈值低于充电目标。

### 2.2 车队与机器人运动、通信

| 参数 | 范围 / 作用 | 当前入口与限制 |
| --- | --- | --- |
| `limits.max_speed` | 车队速度，默认 1 m/s，须大于 0；还受机器人、路线、区域及全局安全限速约束 | 车队编辑页和 PATCH API |
| `limits.max_accel/max_decel/max_yaw_rate` | 加速度、减速度、角速度；默认 0.5、1.0、1.5 | 车队 PATCH API，编辑页未完整提供；实际适配器是否执行每项需逐项核实 |
| `limits.max_vertical_speed/cruise_altitude` | 空中机器人升降速度/巡航高度 | 车队 PATCH API；适用于相关空中模拟与路径，具体适配器需验证 |
| `footprint.shape/radius/length/width` | 圆形/矩形外形，参与路线通行宽度及避碰判断 | 注册向导部分设置；车队 PATCH API；机器人 `physical.footprint` 可覆盖 |
| `navigation.stack/planner/controller/localization` | 导航栈、规划器、控制器、定位描述 | 车队 PATCH API；机器人注册可选部分导航设置，名称存在不代表对应栈已经实现 |
| `communication.protocol/endpoint/namespace/params` | 连接类型、地址、命名空间、协议参数 | 注册向导及车队/机器人 API 部分可配；当前实现支持 simulation、ros2、isaac_demo，MQTT/REST/WebSocket 等枚举不代表已实现 |
| 机器人 `navigation` | map_id、stack、namespace、frame、base_frame、odom_source、localization、sensors | 注册向导提供部分设置，机器人 PATCH API 支持；已注册机器人编辑页仅提供地图等少量字段 |
| 机器人 `physical` | 外形、长宽高、最高速度/加速度、转弯半径、载荷、电池容量、充电/运行时间 | 注册向导提供部分设置；编辑页可改载荷、容量；其他字段经机器人 PATCH API；并非所有字段都已用于规划或控制 |
| `spawn.waypoint_id/pose/battery_pct` | 模拟器初始位置与电量 | 注册向导和机器人 API；属于模拟初始化，不是实车定位设置 |
| 机器人 `enabled`、能力、型号等 | 启停、能力匹配、显示信息 | 机器人页面及 `PATCH /api/v1/robots/{id}`；单机通信/导航覆盖需检查最终 effective 值 |

地图图层由车队定义；车队类型和图层创建后不在 `FleetPatch` 中直接修改。`RobotPatch` 也不包含单独 `robot_type`。不能把可保存的字段等同于已有厂商动作或真实协议能力。

### 2.3 地图、路线和区域

| 配置对象 | 参数 | 当前入口 |
| --- | --- | --- |
| 地图 | 名称、说明、坐标系 `frame`、边界、墙体、障碍、图像及图像分辨率/原点/透明度、metadata | 地图编辑器支持部分创建、背景和编辑；`PATCH /api/v1/maps/{id}` 等 API 支持模型中的字段 |
| 路径点 | 名称、坐标、方向、类型、地面/空中图层、别名、metadata | 地图编辑器与 `/api/v1/waypoints/{id}` |
| 路线 | 起终点、单/双向、限速、宽度、图层、空中高度、关闭、名称、metadata | 地图编辑器和 `/api/v1/lanes/{id}`；起终点在创建时确定，PATCH 不提供修改 |
| 区域 | 多边形、类型、限速、允许车队、图层、metadata | 地图编辑器支持部分字段；区域 API；禁区/禁飞区、慢行区及车队边界含不同语义 |

路线和区域影响导航和交通，不宜仅作为显示参数。路径点的 charger 类型是位置；还必须绑定独立模拟充电设备才能执行模拟充电。

### 2.4 模拟设备

| 参数 | 当前能力和入口 |
| --- | --- |
| 设备 ID、名称、类型、地图、入口/内部/出口点、绑定路线 | `POST /api/v1/devices` 创建；地图编辑器支持在地面路线添加模拟门、在充电点添加模拟充电设备。设备配置目前没有通用 PATCH 编辑接口，修改需检查占用及引用后处理。 |
| `duration_s` | 模拟动作持续时间，默认 0.5 秒，0.01–60 秒；主要用于模拟门和调试设备动作，可由设备创建 API 指定；当前界面未提供输入 |
| `occupied` | 库位初始占货模拟值，默认 false；API 创建时指定，库位调试任务可改变 |
| 模拟门位置 `open/closed/unknown`、故障、恢复 | 地图编辑和主页设备面板可操作；设备占用期间不允许随意改位置；恢复是操作而非配置 |
| 模拟充电设备故障、恢复 | 站点面板可操作；设备预约和持有状态由调度维护 |

设备目前为模拟实现。电梯不能跨楼层执行任务；风淋室、终端、库位主要是调试任务，未完成通用业务任务自动集成。资料中的门控制触发方式、Modbus 地址、通信代理、真实充电协议等在当前代码中**尚不是可用参数**。

### 2.5 单次任务参数

这些是任务输入而不是全局默认配置：任务类型、目的地/取放点、载荷、巡逻路径和轮数（1–20）、巡检对象/时长、充电点、停靠点、优先级（0–9）、指定车队/机器人、能力和载重要求、是否进入受限区域。任务表单通过 `/api/v1/meta` 获取部分规格，完整字段见 `TaskCreate` 和 `TaskManager.build_steps()`；配送取放等待时间 `pickup_s/dropoff_s` 等可由 API 设置，但并非所有字段都出现在界面。危险区域目标需既有确认流程。

## 3. 运行与服务参数

### 3.1 通信、数据和运行环境

以下为 `nayantra/config.py` 声明的名称和**代码默认值**。服务参数不是现有网页的实时可编辑项。脚本可能覆盖设置；下表不披露本机实际配置。

| 参数 | 默认值 / 用途 |
| --- | --- |
| `CORE_HOST`, `CORE_PORT` | `127.0.0.1`, `8000`；Core 监听地址和端口 |
| `NAYANTRA_CORE_URL` | `http://localhost:8000`；其他组件访问 Core 的地址 |
| `NAYANTRA_DB_PATH` | 项目 `data/nayantra.db`；Core 数据库路径。切换路径会使用另一份数据，不是迁移 |
| `NAYANTRA_SCENARIO` | `warehouse_demo`；仅空数据库初始化时导入，空字符串表示不导入 |
| `WEB_DIST_DIR` | 项目 `web/dist`；Core 静态页面目录 |
| `MCP_SERVER_HOST`, `MCP_SERVER_PORT`, `MCP_SERVER_URL` | 默认 `127.0.0.1`, `7000`, `http://localhost:7000`；工具服务监听和访问地址 |
| `AGENT_API_HOST`, `AGENT_API_PORT`, `AGENT_API_URL` | 默认 `127.0.0.1`, `8080`, `http://localhost:8080`；Agent 地址。**当前 `scripts/start.sh` 对 Agent 直接传入 `0.0.0.0:8080`，因此不能假设环境中的 HOST/PORT 会覆盖脚本命令行** |
| `API_TIMEOUT` | 30 秒；部分 Agent HTTP 客户端超时，并非所有设备/请求的全局超时 |
| `DEBUG_MODE`, `LOGGING_LEVEL` | `true`, `INFO`；调试和日志行为，具体取决于启动模块 |
| `FALLBACK_TOOLS_FILE` | `config/tools.json`；Agent 工具列表的回退文件 |

Core 命令行支持 `--host`、`--port`、`--scenario`、`--db`，优先级应结合实际启动命令确认；`--reset` 会删除数据库及 WAL/SHM，不应作为普通参数保存动作。

### 3.2 模型和认证

| 参数 | 说明 |
| --- | --- |
| `LLM_PROVIDER` | `anthropic/openai/gemini`，默认 anthropic |
| `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL` | 对应模型名；代码默认分别为 `claude-sonnet-4-6`、`gpt-4o`、`gemini-3.5-flash` |
| `OPENAI_BASE_URL`, `OPENAI_API_MODE` | OpenAI 兼容地址和 `chat/responses` 格式，默认地址为空、模式 chat |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | 凭据；只展示是否已配置，不能回显、写入事件、日志或普通配置快照 |
| `USE_AUTH`, `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_AUDIENCE`, `JWT_ISSUER`, `API_KEY` | 认证相关配置；默认关闭认证、算法 HS256、audience/issuer 为 nayantra。各服务的实际保护范围应逐项验证，不能把一个开关当成整个系统已认证 |
| `CORS_ORIGINS` | 允许跨域来源列表；不同应用实际附加的来源以代码为准 |

各进程独立读取配置；修改模型或密钥需要重启相关 Agent 服务，Core 的状态显示在其重启前可能仍为旧值。密钥配置页面需要独立安全设计。

### 3.3 可选系统和兼容模式

| 参数 | 用途与边界 |
| --- | --- |
| `OPENRMF_INFRA_TOOLS`, `OPENRMF_API_URL`, `OPENRMF_API_TOKEN` | 可选 Open-RMF 基础设施工具及服务访问；不等于 Core 的模拟门或真实门控制已实现 |
| `ISAAC_SIM_ENABLED`, `ISAAC_SIM_URL`, `ISAAC_SIM_SCENE_PATH`, `ISAAC_DEMO_URL` | Isaac Sim 桥接与 demo 工具；相关服务必须单独部署 |
| `ZENOH_ENABLED`, `ZENOH_ROUTER_URL`, `ZENOH_MODE` | 可选 Zenoh 桥接；具体取决于桥接进程 |
| `ROS_DOMAIN_ID`, `NAYANTRA_CMD_VEL_STAMPED` | ROS 环境域和 Nav2 消息类型覆盖；并非 `Settings` 模型字段 |
| `ROS2_ENABLED`, `RMF_BRIDGE_HOST`, `RMF_BRIDGE_PORT`, `FLEET_NAME`, `ROBOT_NAME` | 旧 RMF bridge 启动兼容配置，不应混同默认 Core 链路 |
| `WAYPOINTS_FILE` | 已标记弃用；现有 Core 路径点由地图注册表管理 |

## 4. 当前写在代码里的算法和安全常量

这些参数目前**不能通过页面或配置 API 调整**。列出是为了后续评估，不建议直接暴露全部数值；它们可能影响多机器人安全和运行稳定性。

| 文件 / 参数 | 当前值 | 用途 |
| --- | --- | --- |
| `core/traffic.py` `PLAN_HORIZON_S` | 900 秒 | 时空规划时间范围 |
| `PRIORITY_GAIN_S`, `STALE_WAIT_S`, `WAIT_EVENT_AFTER_S` | 0.5、15、2 秒 | 优先级收益门槛、陈旧等待重规划、等待事件触发时间 |
| `core/routing.py` `GROUND_CLEARANCE_M`, `AIR_CLEARANCE_M`, `AIR_VERTICAL_SEPARATION_M` | 1.2、2.0、3.0 米 | 路线/节点冲突判定几何间距 |
| `core/allocation.py` `MAX_QUEUE`, `BATTERY_WEIGHT_S` | 3、0.15 | 每机器人任务队列上限、电量分配评分权重 |
| `core/fleet.py` `LOOKAHEAD_STEPS`, `CONTROL_PERIOD_S`, `TELEMETRY_PERIOD_S` | 2 段、0.2 秒、0.2 秒 | 下发前瞻、执行和遥测周期 |
| `SNAP_TO_NODE_M`, `STALL_S` | 0.8 米、45 秒 | 入图贴近判定和堵停告警 |
| `core/safety.py` `MAX_GROUND_SPEED_MPS`, `MAX_AIR_SPEED_MPS` | 2、6 m/s | 全局地面/空中速度上限 |
| `core/adapters/sim.py` `TICK_S`, `PASS_TOL_M`, `ARRIVE_TOL_M`, `STOP_ZONE_MARGIN_M` | 0.05 秒、0.35 米、0.05 米、0.25 米 | 运动学模拟步长、到点和停止距离 |
| `DWELL_ACTIONS_S` | 对接 3 秒、解除对接 2 秒 | 模拟原生对接动作时长（模拟时间） |
| `core/adapters/nav2.py` `PASS_TOL_M`, `ARRIVE_TOL_M`, `ODOM_STALE_S` | 0.6 米、0.35 米、2 秒 | Nav2 到点和里程计过期判断，需实车确认 |
| `core/tasks.py` `DWELL_S` | 取货 4 秒、放货 4 秒、巡检 8 秒、操作 6 秒 | 动作没有原生实现时的等待默认值；不能视为真实业务完成反馈 |
| `core/confirmations.py` `TTL_S` | 180 秒 | 操作确认过期时间 |

此外源码内还有具体重试次数、间隔、队列长度和超时等局部常数，需按计划开放的功能逐个审计；本表列主要调度相关项，并非所有代码数字的穷举。

## 5. 现有界面缺口和后续页面建议

1. **车队策略**：车队编辑窗口现可修改最低电量、回充和充满阈值及自动充电开关，并在界面校验阈值关系；后续可补充运动限制、展示继承与最终生效值，并考虑统一的后端跨字段校验。
2. **设备配置**：已有模拟门/充电设备的基础创建和操作；缺设备列表、完整配置编辑、使用前校验、动作时长配置和故障恢复指引。真机地址/协议应待驱动实现后再提供，避免出现无效配置。
3. **地图与机器人**：保留各自业务页面，统一展示与策略相关的有效参数；模型中的某些字段只有 API 或注册向导可编辑，不能笼统称为已经有完整配置页面。
4. **系统设置**：服务地址、模型、认证、可选集成和日志与业务参数分开；明确值来源、保存位置、重启影响和凭据保护。优先提供只读诊断，后续再设计可写配置及权限。
5. **高级调度与安全**：交通时间、间距、队列、硬限速等目前是代码常量；需先明确单位、约束、适用范围、运行中变更行为、回滚和仿真/实车验证，再决定是否开放。
6. **可观测性**：参数页应区分数据库设置、运行时生效值、启动配置和模拟状态，并显示生效范围；不展示密钥明文。修改控制相关参数应有审计及必要的状态校验。

关键来源：`nayantra/config.py`、`config/.env.example`、`nayantra/core/models.py`、`world.py`、`fleet.py`、`traffic.py`、`routing.py`、`allocation.py`、`safety.py`、`devices/__init__.py`、`api.py`，以及 `web/src/pages/Fleets.tsx`、`RobotsTasks.tsx`、`MapEditor.tsx`、`web/src/components/RegisterWizard.tsx`。
