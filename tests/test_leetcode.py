import httpx
import pytest

from leetgit.leetcode import LeetCodeClient, LeetCodeError


def _transport(handler):
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_get_question_parses_fields():
    def handler(request):
        return httpx.Response(200, json={"data": {"question": {
            "questionFrontendId": "1", "title": "Two Sum", "titleSlug": "two-sum",
            "difficulty": "Easy", "content": "<p>hi</p>",
            "topicTags": [{"name": "Array", "slug": "array"}],
        }}})

    async with httpx.AsyncClient(transport=_transport(handler)) as http:
        client = LeetCodeClient(client=http)
        q = await client.get_question("two-sum")
    assert q.frontend_id == "1"
    assert q.tags == ["Array"]
    assert q.url == "https://leetcode.com/problems/two-sum/"


@pytest.mark.asyncio
async def test_get_submission_requires_data():
    def handler(request):
        return httpx.Response(200, json={"data": {"submissionDetails": None}})

    async with httpx.AsyncClient(transport=_transport(handler)) as http:
        client = LeetCodeClient(client=http)
        with pytest.raises(LeetCodeError) as exc:
            await client.get_submission(42, {"LEETCODE_SESSION": "x"})
    assert exc.value.auth is True


@pytest.mark.asyncio
async def test_auth_status_raises_auth_error():
    def handler(request):
        return httpx.Response(403, json={})

    async with httpx.AsyncClient(transport=_transport(handler)) as http:
        client = LeetCodeClient(client=http)
        with pytest.raises(LeetCodeError) as exc:
            await client.get_question("two-sum")
    assert exc.value.auth is True
