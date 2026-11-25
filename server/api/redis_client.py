# redis_client.py
from __future__ import annotations

import asyncio
import uuid
from typing import Any

from redis.asyncio import Redis

_RELEASE_LUA = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
"""


class RedisClient:
    def __init__(self,
                 host: str, port: int, db: int,
                 decode_responses: bool = False,
                 ssl_enable: bool = False,
                 ssl_certfile: str | None = None,
                 ssl_keyfile: str | None = None,
                 ssl_ca_certs: str | None = None,
                 username: str | None = None,
                 password: str | None = None,
                 lock_prefix: str = "LOCK",
                 logger: Any = None):
        self._host = host
        self._port = port
        self._db = db
        self._decode = decode_responses
        self._ssl = ssl_enable
        self._ssl_certfile = ssl_certfile
        self._ssl_keyfile = ssl_keyfile
        self._ssl_ca_certs = ssl_ca_certs
        self._username = username
        self._password = password
        self._client: Redis | None = None
        self.lock_prefix = lock_prefix
        self.logger = logger

    async def connect(self) -> Redis:
        if self._client is None:
            self._client = Redis(
                host=self._host,
                port=self._port,
                db=self._db,
                ssl=self._ssl,
                ssl_certfile=self._ssl_certfile,
                ssl_keyfile=self._ssl_keyfile,
                ssl_ca_certs=self._ssl_ca_certs,
                username=self._username,
                password=self._password,
                decode_responses=self._decode
            )
            if self.logger:
                self.logger.debug("RedisClient connect",
                                  self._host, self._port, self._db)
        return self._client

    @property
    def client(self) -> Redis:
        if self._client is None:
            raise RuntimeError(
                "RedisClient not connected. Call connect() first.")
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None

    async def get(self, key: str) -> bytes | str | None:
        return await self.client.get(key)

    async def set(self, key: str, value: bytes | str) -> bool:
        return bool(await self.client.set(key, value))

    async def setex(self, key: str, ttl: int, value: bytes | str) -> bool:
        if self.logger:
            self.logger.debug("setex", key)
        return await self.client.setex(key, ttl, value)

    async def delete(self, key: str) -> int:
        return await self.client.delete(key)

    async def ping(self) -> bool:
        return await self.client.ping()

    async def acquire_lock(self, key: str, ttl: int = 10,
                           retry_count: int = 3,
                           retry_interval: float = 0.05) -> tuple[bool, str]:
        if self.logger:
            self.logger.debug("RedisClient acquire_lock", key)
        lock_key = f"{self.lock_prefix}{key}"
        val = uuid.uuid4().hex
        count = 0
        sleep = min(retry_interval, 0.2)
        while True:
            ok = await self.client.set(lock_key, val, nx=True, ex=max(1, ttl))
            if self.logger:
                self.logger.debug("RedisClient acquire_lock", key)
            if ok:
                return True, val
            if self.logger:
                self.logger.debug(f"RedisClient acquire_lock"
                                  f" attempt{count} failed", key)
            if count >= retry_count:
                self.logger.warning("RedisClient acquire_lock failed", key)
                return False, ""
            await asyncio.sleep(sleep)
            count += 1

    async def release_lock(self, key: str, val: str) -> bool:
        if self.logger:
            self.logger.debug("RedisClient release_lock", key)
        lock_key = f"{self.lock_prefix}{key}"
        try:
            res = await self.client.eval(_RELEASE_LUA, 1, lock_key, val)
            return bool(res == 1)
        except Exception:
            if self.logger:
                self.logger.warning("RedisClient release_lock failed", key)
            return False
