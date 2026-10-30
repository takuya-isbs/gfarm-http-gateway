from unittest.mock import AsyncMock, Mock, patch

import pytest

from redis_client import RedisClient


def make_client():
    return RedisClient("redis", 6379, 0, lock_prefix="TEST-")


@pytest.mark.asyncio
async def test_connect_reuses_client_and_close_resets_it():
    client = make_client()
    redis = Mock(close=AsyncMock())

    with patch("redis_client.Redis", return_value=redis) as redis_class:
        assert await client.connect() is redis
        assert await client.connect() is redis
        await client.close()

    redis_class.assert_called_once()
    redis.close.assert_awaited_once()
    with pytest.raises(RuntimeError, match="not connected"):
        _ = client.client


@pytest.mark.asyncio
async def test_redis_operations_delegate_to_client():
    client = make_client()
    client._client = AsyncMock()
    client._client.get.return_value = b"value"
    client._client.set.return_value = True
    client._client.setex.return_value = True
    client._client.delete.return_value = 1
    client._client.ping.return_value = True

    assert await client.get("key") == b"value"
    assert await client.set("key", b"value") is True
    assert await client.setex("key", 10, b"value") is True
    assert await client.delete("key") == 1
    assert await client.ping() is True


@pytest.mark.asyncio
async def test_acquire_lock_succeeds_after_retry():
    client = make_client()
    client._client = AsyncMock()
    client._client.set.side_effect = [False, True]

    acquired, value = await client.acquire_lock(
        "key", retry_count=1, retry_interval=0)

    assert acquired is True
    assert value
    assert client._client.set.await_count == 2


@pytest.mark.asyncio
async def test_acquire_lock_returns_failure_after_retries():
    client = make_client()
    client._client = AsyncMock()
    client._client.set.return_value = False
    client.logger = Mock()

    acquired, value = await client.acquire_lock(
        "key", retry_count=1, retry_interval=0)

    assert acquired is False
    assert value == ""
    client.logger.warning.assert_called_once()


@pytest.mark.asyncio
async def test_release_lock_returns_eval_result():
    client = make_client()
    client._client = AsyncMock()
    client._client.eval.side_effect = [1, 0, RuntimeError("failed")]

    assert await client.release_lock("key", "value") is True
    assert await client.release_lock("key", "value") is False
    assert await client.release_lock("key", "value") is False
