# Nayantra 项目交接说明

## 项目与目标

本项目基于开源 Nayantra（上游 https://github.com/shashankbr27/nayantra），用于探索 AGV、AMR、无人叉车和人形机器人的混合车队管理。保留上游 Apache-2.0 许可证与版权信息。修改前先查看 Git 状态，不覆盖用户已有的工作、地图、任务数据或配置。

## 本机环境

- 开发目录：WSL Ubuntu 22.04 的 `/home/wangt/nayantra`。
- Python：项目要求 3.11+；本机 `.venv` 使用独立安装的 Python 3.11。不要替换系统 Python。
- 前端：`web/`，React、TypeScript、Vite；后端：`nayantra/`，Python、FastAPI。
- 本地配置：根目录 `.env`，从 `config/.env.example` 创建。不要读取、打印、提交 API 密钥或其他凭据；不要覆盖现有配置。
- `data/` 是本地运行数据，`runtime/` 包含运行日志、进程信息及本地临时资料。用户地图和任务属于需要保留的数据。

## 运行与检查

默认先用内置运动学模拟模式，它不依赖 Open-RMF、ROS 2、GPU 或大模型密钥。模拟不代表真机、物理仿真和安全认证已验证。

```bash
cd /home/wangt/nayantra
bash scripts/start.sh
# 操作界面 http://localhost:8000/
# 核心 API http://localhost:8000/docs
# 工具接口 http://localhost:7000/tools
# Agent API http://localhost:8080/docs
bash scripts/stop.sh
```

WSL 重启后通常需要重新启动。启动脚本的 Agent API 监听 0.0.0.0:8080，部署到共享网络前检查绑定地址与认证。服务日志在 `runtime/logs/`。启动或停止前先检查已有进程和端口，避免影响其他应用。

修改前端后执行 `cd web && npm run build`，修改后端时按范围运行 `.venv/bin/python -m pytest` 相关测试。构建产物不提交；使用本地运行的服务时，构建后刷新页面并检查健康接口。若改动涉及紧停、任务分配、交通协调或设备指令，应在模拟环境验证并清晰说明真机验证状态。

## 架构与边界

Nayantra Core 自行负责任务分配与交通协调；按当前项目说明，Open-RMF 是可选基础设施，默认链路不使用 `rmf_traffic`。项目所称 MCP 工具服务当前基于 REST 工具语义，不是标准 MCP JSON-RPC；对外兼容性需另行验证。具体机器人、叉车业务动作、厂商协议和 ROS 版本是否兼容，须通过适配器及实际设备验证，不能假设开箱支持。

## 中文界面

界面默认中文，顶部可切换英文，偏好存储在浏览器 localStorage 的 `nayantra-language`。翻译逻辑在 `web/src/lib/language.ts`，词条在 `web/src/lib/translations.ts`；界面组件位于 `web/src/components/`、`web/src/pages/`。

现有翻译覆盖主要静态页面和部分常见动态消息，**尚非完整中文**：部分后端自由文本、任务原因、错误及动态标签仍可能显示英文。名称、ID、地图/站点值、API 参数和用户输入不得为了翻译而改变。新增译文时保留英文切换，特别核实急停、确认、取消、交通及任务状态的准确性，避免改动控制语义；未知消息保留原文，避免误译。需要完整中文时继续逐页核查真实场景，并补充有意义的中英文切换和任务参数测试。

## Git 工作约定

`origin` 最初指向上游仓库；推送前核实目标地址与用户账户。只提交源代码和明确需要的文档；不要提交 `.env`、密钥、虚拟环境、node_modules、构建产物、数据库、日志或本地翻译备份。用户未要求时不要重置已有工作或数据。提交前运行 `git diff --check`、适用的构建/测试，并核对暂存文件。

## 大模型兼容接口

OpenAI 兼容连接使用 OPENAI_BASE_URL、OPENAI_MODEL 和 OPENAI_API_MODE（chat 或 responses）；默认使用 chat。Responses 模式支持工具调用及流式输出。具体地址和密钥仅存在本地 .env，不要放入 Git 或日志。修改这些设置后需要重启 Agent 服务；核心服务的状态显示在其重启前可能仍为旧值。
