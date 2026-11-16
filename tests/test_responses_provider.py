import json
from types import SimpleNamespace

import pytest

from nayantra.agent.agent import _OpenAIResponsesProvider


class Item:
    def __init__(self, **values):
        self.__dict__.update(values)

    def model_dump(self, **kwargs):
        return dict(self.__dict__)


class Stream:
    def __init__(self, response):
        self.response = response

    def __aiter__(self):
        async def events():
            yield SimpleNamespace(type="response.completed", response=self.response)
        return events()


@pytest.mark.asyncio
async def test_responses_round_trip_preserves_tool_calls_and_results():
    requested = []
    replies = [
        SimpleNamespace(output=[Item(type="function_call", call_id="call_1", name="list_robots", arguments='{}')], output_text=""),
        SimpleNamespace(output=[Item(type="message", role="assistant", content=[])], output_text="有两台机器人"),
    ]

    async def create(**kwargs):
        requested.append(kwargs)
        return Stream(replies.pop(0))

    provider = _OpenAIResponsesProvider.__new__(_OpenAIResponsesProvider)
    provider.client = SimpleNamespace(responses=SimpleNamespace(create=create))
    provider.model = "sample"
    provider.start("列出机器人", [{"name": "list_robots", "description": "List", "parameters": {}}])

    first = await provider.next_turn()
    assert first.stop == "tool_use"
    assert first.calls[0].id == "call_1"
    assert requested[0]["stream"] is True and requested[0]["store"] is False
    assert requested[0]["tools"][0]["name"] == "list_robots"

    provider.add_results([(first.calls[0], {"robots": ["r1", "r2"]}, False)])
    second = await provider.next_turn()
    assert second.text == "有两台机器人" and second.stop == "end"
    result = requested[1]["input"][-2]
    assert result["type"] == "function_call_output"
    assert result["call_id"] == "call_1"
    assert json.loads(result["output"]) == {"robots": ["r1", "r2"]}


@pytest.mark.asyncio
async def test_responses_stream_without_completion_fails():
    class EmptyStream:
        def __aiter__(self):
            async def events():
                if False:
                    yield None
            return events()

    async def create(**kwargs):
        return EmptyStream()

    provider = _OpenAIResponsesProvider.__new__(_OpenAIResponsesProvider)
    provider.client = SimpleNamespace(responses=SimpleNamespace(create=create))
    provider.model = "sample"
    provider.start("hello", [])
    with pytest.raises(RuntimeError, match="without a completed response"):
        await provider.next_turn()
