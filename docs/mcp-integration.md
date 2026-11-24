# 通用标准 MCP 接入说明

本项目提供标准 MCP 的 **stdio** 服务，供 Codex、WorkBuddy 等支持 MCP stdio 的
客户端启动。不同客户端的配置入口和字段名称可能不同，请以其当前版本为准。它通过
Nayantra Core 的 API 读取车队状态和执行工具。项目原有的 7000 端口服务使用
REST 接口，供原有 Agent 使用；它不是标准 MCP 地址，不要把
`http://localhost:7000/tools` 填入客户端的流式 HTTP 地址。

## 1. 准备项目和 Core

在项目所在的 Linux 或 WSL 终端中执行（以下路径以本机项目位置为例）：

```bash
cd /home/wangt/nayantra
uv pip install --python .venv/bin/python -e .
```

如果没有 `uv`，可在虚拟环境包含 pip 时使用
`.venv/bin/python -m pip install -e .`。可编辑安装使客户端从其他工作目录启动时
也能找到项目代码。首次安装和其他环境的准备步骤见
[getting_started.md](getting_started.md)。不要覆盖已有的 `.env` 或数据。

启动前先检查端口及 Core 接口：

```bash
ss -ltnp '( sport = :8000 or sport = :7000 or sport = :8080 )'
curl -fsS http://localhost:8000/api/v1/health
```

健康接口正常时会返回包含 `status` 和 `version` 的 JSON。如果 Core 未启动，且
端口未被其他应用占用，可以在项目目录运行 `bash scripts/start.sh`；该脚本会启动
Core、原有 REST 工具服务和 Agent。stdio 服务由 MCP 客户端按需启动，无需手动运行。
如果端口已被占用，先确认进程身份，不要直接结束其他应用。

Core 默认地址是 `http://localhost:8000`。使用其他地址时，可在项目根目录 `.env`
设置 `NAYANTRA_CORE_URL`，例如 `NAYANTRA_CORE_URL=http://localhost:8765`；
它必须指向实际运行的 Nayantra Core。修改后重新启动 MCP 客户端会话。标准 MCP
连接不依赖 7000 端口的 REST 服务或 Agent API。

## 2. 通用客户端配置

在智能体应用中找到 MCP 服务管理或自定义 MCP 配置，添加一个 **stdio / 本地命令**
服务。需要客户端支持启动本地进程并使用 MCP stdio；仅支持远程 HTTP 的客户端不能
直接连接本项目现有的 stdio 服务。服务名称自定，命令填写可执行文件路径，参数按
顺序分别填写。路径必须存在于启动命令所在的系统中。

### Linux、macOS 或 WSL 客户端

将示例路径替换为本机项目路径：

| 字段 | 内容 |
| --- | --- |
| 名称 | `nayantra` |
| 类型 | `stdio` |
| 启动命令 | `/home/wangt/nayantra/.venv/bin/python` |
| 参数 | `-m`、`nayantra.mcp.stdio`，各占一项 |
| 环境变量 | 通常留空；按需配置 Core 地址 |
| 工作目录 | 可留空；如客户端要求，填写项目根目录 |

如果客户端使用 JSON 配置，常见格式示例如下；具体文件位置和键名以客户端说明为准：

```json
{
  "mcpServers": {
    "nayantra": {
      "command": "/home/wangt/nayantra/.venv/bin/python",
      "args": ["-m", "nayantra.mcp.stdio"]
    }
  }
}
```

### Windows 客户端连接 WSL 项目

使用下面的 Windows `wsl.exe` 作为启动命令，由它进入项目所在的 WSL 发行版。将
发行版名称和项目路径替换为实际值；在 WSL 终端执行 `printenv WSL_DISTRO_NAME`
可查看发行版名称。

| 字段 | 内容 |
| --- | --- |
| 名称 | `nayantra` |
| 类型 | `stdio` |
| 启动命令 | `C:\Windows\System32\wsl.exe` |
| 参数 | 依次添加 `-d`、`Ubuntu-22.04`、`--`、`/home/wangt/nayantra/.venv/bin/python`、`-m`、`nayantra.mcp.stdio`，每项单独填写 |
| 环境变量、环境变量传递、工作目录 | 通常留空 |

支持相同 JSON 结构的客户端可参考：

```json
{
  "mcpServers": {
    "nayantra": {
      "command": "C:\\Windows\\System32\\wsl.exe",
      "args": ["-d", "Ubuntu-22.04", "--", "/home/wangt/nayantra/.venv/bin/python", "-m", "nayantra.mcp.stdio"]
    }
  }
}
```

`-d` 和发行版名称选择 WSL 环境；`--` 表示后面是要在 Linux 内执行的命令；Python
路径选择项目虚拟环境；`-m nayantra.mcp.stdio` 启动 MCP 服务。确保启动命令前后
没有空格或制表符，`--` 位于 Python 路径**之前**。

### Windows 原生项目

若项目和 Python 虚拟环境本身都在 Windows，而不是 WSL，先按
[Windows 原生安装步骤](getting_started.md#7-windows-native-steps)安装项目和启动 Core，
再在客户端使用以下参数，路径替换为实际位置：

| 字段 | 内容 |
| --- | --- |
| 启动命令 | `C:\path\to\nayantra\.venv\Scripts\python.exe` |
| 参数 | `-m`、`nayantra.mcp.stdio`，各占一项 |

Windows 原生虚拟环境与 WSL 虚拟环境不能互换。上述 JSON 示例中的 Windows 路径
在 JSON 内需要使用 `\\` 转义；在图形界面的普通文本字段中填写单个 `\`。

### WorkBuddy 和其他智能体

在应用的 MCP 设置中选择新增本地 stdio 服务，并根据应用运行位置填写上述对应的
命令和参数。若应用提供 JSON 编辑器，先核对它要求的配置结构，再参考上述示例；
不同版本的入口、配置文件位置和字段可能不同。保存并启用后，新建会话或按应用提示
重新加载服务。尚未在本项目环境中验证各 WorkBuddy 版本的具体界面及兼容性；连接
情况以工具发现和调用结果为准。

## 3. Codex CLI 示例

将下面的项目路径替换为实际路径：

```bash
codex mcp add nayantra -- /home/wangt/nayantra/.venv/bin/python -m nayantra.mcp.stdio
codex mcp list
codex mcp get nayantra
```

第一个 `--` 把 Codex 的选项与服务启动命令分开。配置后新建 Codex 会话。服务名称
可自行选择；删除该配置可执行 `codex mcp remove nayantra`。

## 4. Codex Windows 桌面端示例

Windows 桌面应用和 WSL 中的 Codex 可能使用不同的配置；在 WSL 终端注册后，如果
Windows 应用没有显示该服务，请在 Windows 应用的「设置 → 插件 → 添加 → 自定义
MCP」中添加。先在 WSL 终端用 `printenv WSL_DISTRO_NAME` 查看发行版名称。以下以
`Ubuntu-22.04` 和 `/home/wangt/nayantra` 为例：

| 字段 | 内容 |
| --- | --- |
| 名称 | `nayantra`（或其他易识别的名称） |
| 类型 | `STDIO` |
| 启动命令 | `C:\Windows\System32\wsl.exe` |
| 参数 | 依次添加下列六行，每行一个参数 |
| 环境变量、环境变量传递、工作目录 | 留空 |

```text
-d
Ubuntu-22.04
--
/home/wangt/nayantra/.venv/bin/python
-m
nayantra.mcp.stdio
```

保存后新建会话；如果没有加载，
完全退出并重启应用，再新建会话。

## 5. 使用和验证

在新会话中可以输入：

```text
请列出 Nayantra MCP 的工具，然后查询当前车队状态。
```

也可以询问机器人、电量、地图、站点和任务状态，或要求创建任务。工具列表能出现
表示 MCP 连接已经建立；车队查询成功还需要 Core 可用并有相应数据。危险操作会返回
待确认状态，需要操作员在界面确认，MCP 客户端不能代替操作员确认。

## 6. 常见问题

- **会话说没有连接或没有工具**：检查服务是否已保存和启用；检查启动命令、参数顺序、
  WSL 发行版及 Python 路径。新建会话，必要时重启应用。Linux 和 Windows 配置可能
  独立，不要只检查另一侧的 `codex mcp list`。
- **`No module named nayantra` 或 `No module named mcp`**：确认使用的是项目的
  `.venv`，并在该环境执行第 1 节的可编辑安装。
- **工具可见但调用返回连接错误或 `Not Found`**：在项目运行的环境中检查
  `curl -fsS http://localhost:8000/api/v1/health`，并核对 `NAYANTRA_CORE_URL`。
  端口有进程监听不代表它就是 Nayantra Core；若返回 404，检查是否连接到了其他服务。
- **不要直接在终端运行 stdio 服务来查看工具列表**：stdio 是客户端与服务之间的协议
  通道，服务会等待协议消息。使用客户端的工具列表或通过 MCP 客户端验证。

stdio 进程直接使用 Core 客户端，不经过 7000 端口 REST 服务的 JWT 认证；其访问取决于
本地进程权限和 Core 的访问控制。工具既可读取状态，也可发起操作，请只在可信环境中
启用。实际设备的行为需要通过适配器及设备验证。
