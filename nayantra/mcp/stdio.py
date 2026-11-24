"""Standard MCP stdio transport for local clients such as Codex."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server

from nayantra.config import settings
from nayantra.mcp.core_client import CoreClient, Trace
from nayantra.mcp.tools import TOOL_REGISTRY, ToolContext, execute_tool
from nayantra.rmf_client.client import OpenRMFClient

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(server: Server) -> AsyncIterator[ToolContext]:
    core = CoreClient()
    rmf = None
    try:
        if settings.OPENRMF_INFRA_TOOLS:
            rmf = OpenRMFClient(
                api_url=settings.OPENRMF_API_URL,
                token=settings.OPENRMF_API_TOKEN,
                debug=settings.DEBUG_MODE,
            )
        yield ToolContext(core=core, rmf=rmf)
    finally:
        await core.close()
        if rmf is not None:
            await rmf.close()


server = Server("nayantra", version="0.1.0", lifespan=lifespan)


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name=spec.name,
            description=spec.description,
            inputSchema=spec.params.model_json_schema(),
            annotations=types.ToolAnnotations(readOnlyHint=spec.risk == "read"),
        )
        for spec in TOOL_REGISTRY.values()
        if not spec.legacy
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> types.CallToolResult:
    # Use a fresh trace per request: concurrent calls must not overwrite each other.
    shared = server.request_context.lifespan_context
    ctx = ToolContext(core=shared.core, rmf=shared.rmf, trace=Trace())
    try:
        # Only expose the same public tools advertised by list_tools.
        if name not in TOOL_REGISTRY or TOOL_REGISTRY[name].legacy:
            raise ValueError(f"Unknown tool: {name}")
        result = await execute_tool(ctx, name, arguments)
        failed = isinstance(result, dict) and result.get("ok") is False
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False, default=str))],
            isError=failed,
        )
    except Exception as exc:
        logger.exception("MCP tool execution failed: %s", name)
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=str(exc))], isError=True
        )


async def run() -> None:
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
