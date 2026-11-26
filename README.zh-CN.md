# 🤖 Nayantra — 异构机器人车队智能运营平台

中文 | [English](README.md)

Nayantra 为多种机器人车队提供统一的地图、任务调度和运营界面，运行在机器人自身导航系统之上。操作员可以通过界面或自然语言创建任务；Core 负责机器人分配、路线规划、交通协调和安全规则，并提供分配原因。

项目仓库：[Gitee](https://gitee.com/qingzhan-zhizao/tsingbotnayantra)。本项目基于 [上游 Nayantra](https://github.com/shashankbr27/nayantra)，遵循 [Apache License 2.0](LICENSE)。

## 架构

- **意图层**：操作界面、CLI 和自然语言 Agent 创建任务；工具层提供带风险标记的操作，危险操作需要操作员确认。
- **协调层**：Nayantra Core 维护地图、站点、路线、区域、车队和机器人状态，并负责任务分配、交通协调、安全规则和事件记录。
- **执行层**：机器人适配器接收 Core 已协调的路线并报告位置和进度；局部避障和运动控制由机器人自身导航系统负责。

Core 自行负责任务分配和交通协调，默认链路不使用 Open-RMF 的 `rmf_traffic`；真实 Open-RMF 服务是可选基础设施（`OPENRMF_INFRA_TOOLS=true`）。7000 端口的工具服务使用 REST；另有独立的标准 MCP stdio 服务供 Codex 等客户端使用。详细设计见 [平台架构](docs/platform_architecture.md)和[组件架构](docs/architecture.md)。

## 功能与现状

| 领域 | 说明 |
|---|---|
| 地图与车队 | 管理地图、站点、路线、区域和异构车队；支持机器人能力、载荷、电量等属性。 |
| 任务与交通 | 支持导航、配送、巡检、充电等任务；分配时考虑能力、地图、可达性、电量和成本，并记录原因。交通协调使用时空预约和冲突处理。 |
| 安全 | Core 提供禁行区、限速和急停等规则；危险操作需要操作员确认。模拟验证不等于真机安全认证。 |
| 操作界面 | 提供实时地图、车队、任务、交通、告警和地图编辑器，支持明暗主题。界面默认中文，可切换英文；无法匹配的后端或厂商消息保留原文。 |
| 自然语言 | Agent 通过高层工具创建任务，不直接发送机器人速度指令；支持 Anthropic、OpenAI 和 Gemini。 |
| 适配器 | 提供 Nav2、Isaac 示例和内置模拟适配器；其他协议及具体设备需要适配和验证。 |
| 模拟设备 | 模拟门可绑定路线，模拟充电设备可绑定充电站点；其他模拟设备可通过设备任务操作。详见[模拟设备与调度](docs/device-simulation.md)。 |

内置运动学模拟不依赖 ROS 2、GPU 或大模型密钥，也不代表物理仿真、真实设备或安全认证已验证。模拟设备不连接 PLC、门控、梯控或充电桩，不可用于控制真实设备。Nav2 适配器已在 Gazebo 和 ROS 2 Jazzy 环境中运行；Isaac Sim、ROS 2 Humble 和真实机器人集成仍需进一步验证。Isaac 示例目前针对单台 Carter 机器人，多机器人 Isaac Sim 尚未接通。

## 快速开始

需要 Python 3.11+；构建界面需要 Node.js 20.19+ 或 22.12+。下面以 Linux 为例，首次安装：

```bash
git clone https://gitee.com/qingzhan-zhizao/tsingbotnayantra.git nayantra
cd nayantra
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[test]"
cp -n config/.env.example .env
(cd web && npm ci && npm run build)
```

已有 `.env` 时请保留现有配置。只有使用自然语言功能时才需要配置相应服务商的 API 密钥；不要提交密钥。OpenAI 兼容服务可通过 `OPENAI_BASE_URL`、`OPENAI_MODEL` 和 `OPENAI_API_MODE`（`chat` 或 `responses`）配置，修改后重启 Agent。

启动完整服务：

```bash
bash scripts/start.sh
# 停止服务
bash scripts/stop.sh
```

| 服务 | 地址 |
|---|---|
| 操作界面 | http://localhost:8000/ |
| Core API 文档 | http://localhost:8000/docs |
| REST 工具服务 | http://localhost:7000/tools |
| Agent API 文档 | http://localhost:8080/docs |

启动脚本需要根目录的 `.venv` 和 `.env`，日志位于 `runtime/logs/`。脚本将 Agent API 绑定到 `0.0.0.0:8080`；在共享网络使用前请检查监听范围和认证设置。也可以只启动内置模拟 Core：

```bash
nayantra-core --scenario warehouse_demo
```

Core 默认使用 SQLite 持久化状态（`data/nayantra.db`）。`--scenario NAME` 选择场景，`--db PATH` 选择数据库，`--port` 更改端口；`--reset` 会清除并重新初始化状态，请先确认数据不再需要。

在界面上选择站点并创建导航或配送任务，即可查看分配原因和模拟机器人运行状态。也可以直接调用 API：

```bash
curl -X POST http://localhost:8000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"type": "navigate", "params": {"destination": "Charger 1"}}'
```

## MCP 接入

安装依赖并启动 Core 后，可将 stdio 服务注册到 Codex（按实际路径修改）：

```bash
codex mcp add nayantra -- /home/wangt/nayantra/.venv/bin/python -m nayantra.mcp.stdio
```

Codex 按需启动该进程；它读取项目配置并直接访问 `NAYANTRA_CORE_URL`，不需要 7000 端口的 REST 工具服务。stdio 可以访问本地工具层提供的操作，包括需要在界面确认的操作；REST 服务的 JWT 认证不适用于 stdio，访问范围取决于谁能启动本地进程及访问 Core。其他客户端和 Windows/WSL 配置见 [MCP 接入说明](docs/mcp-integration.md)。

## 仿真与机器人接入

`./nayantra.sh setup` 可选择 Gazebo、Isaac Sim 或自动检测；内置模拟可直接使用，不需要安装这些仿真器。Gazebo 多机器人环境需要 ROS 2 和 Nav2；Isaac Sim 6.0+ 需要兼容的 NVIDIA GPU 和相应资源。安装、硬件要求、启动方式及当前验证范围见英文 README 的[仿真器选择](README.md#-choosing-a-simulator-gazebo-isaac-sim-or-stub-mode)、[Gazebo 架构](docs/gazebo_architecture.md)、[Isaac Sim 配置](docs/isaac_sim_setup.md)和[内置模拟](docs/stub_mode.md)。

ROS 2 机器人可使用 RViz 2 查看传感器、地图和路径，详见 [RViz 配置](docs/rviz_setup.md)。跨网络连接可使用 Zenoh，详见 [Zenoh 配置](docs/zenoh_setup.md)。具体机器人、厂商协议和 ROS 版本需要通过适配器及实际设备验证。

## 项目结构

- `nayantra/core/`：世界模型、调度、交通、安全、适配器和 API。
- `nayantra/mcp/`、`nayantra/agent/`：工具服务和自然语言 Agent。
- `web/`：React、TypeScript 和 Vite 操作界面。
- `config/`：地图、场景与配置模板；`data/` 保存本地运行数据。
- `simulation/`、`scripts/`、`docs/`、`tests/`：仿真、启动脚本、文档和测试。

## 认证与测试

服务使用 HS256 JWT；启用认证时需在根目录 `.env` 设置强随机 `JWT_SECRET` 和 `USE_AUTH=true`，然后通过 `nayantra-token` 签发令牌。不要将密钥提交到 Git。直接启动服务时默认监听本地地址，但 `scripts/start.sh` 会显式将 Agent API 监听在 `0.0.0.0`。

```bash
pip install -e ".[test]"
pytest tests/ -v --cov=nayantra
(cd web && npm ci && npm run build)
(cd web && npm run test:i18n)
```

后端测试不需要 GPU、ROS 2 或大模型密钥。更多配置和操作文档见 [文档目录](docs/README.md)。

## 贡献、安全与许可

贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。发现安全问题请遵循 [SECURITY.md](SECURITY.md) 中的负责任披露流程。项目采用 [Apache License 2.0](LICENSE)。
