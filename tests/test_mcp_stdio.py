"""Exercise the standard transport with a real MCP client and a mock Core."""

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


@pytest.mark.asyncio
async def test_stdio_discovery_validation_and_core_call():
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append((self.path, self.headers.get("X-Nayantra-Client")))
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"[]")

        def log_message(self, *args):
            pass

    http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    try:
        params = StdioServerParameters(
            command=sys.executable,
            args=["-m", "nayantra.mcp.stdio"],
            cwd=Path(__file__).resolve().parents[1],
            env={"NAYANTRA_CORE_URL": f"http://127.0.0.1:{http.server_port}"},
        )
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = await session.list_tools()
                assert "list_fleets" in {tool.name for tool in tools.tools}
                fleet = next(tool for tool in tools.tools if tool.name == "get_fleet_state")
                assert "fleet_id" in fleet.inputSchema["required"]
                invalid = await session.call_tool("get_fleet_state", {})
                assert invalid.isError
                result = await session.call_tool("list_fleets", {})
                assert not result.isError
                assert json.loads(result.content[0].text) == []
                assert requests == [("/api/v1/fleets", "mcp")]
    finally:
        http.shutdown()
        thread.join()
        http.server_close()
