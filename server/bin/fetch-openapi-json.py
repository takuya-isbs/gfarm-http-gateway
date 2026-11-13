#!/usr/bin/env python3
"""Print the server's OpenAPI document by requesting its /openapi.json route."""

import os
from pathlib import Path
import sys

from fastapi.testclient import TestClient


SERVER_DIR = Path(__file__).resolve().parent.parent
API_DIR = SERVER_DIR / "api"
# Test-only Fernet key; the helper only requests the OpenAPI document.
OPENAPI_TEST_SESSION_SECRET = "b3BlbmFwaS1jb250cmFjdC10ZXN0LWtleS0wMDAwMDA="
os.chdir(SERVER_DIR)
os.environ.setdefault(
    "GFARM_HTTP_CONFIG_FILE", str(SERVER_DIR / "gfarm-http-gateway.conf.default")
)
os.environ.setdefault(
    "GFARM_HTTP_SESSION_SECRET", OPENAPI_TEST_SESSION_SECRET
)
os.environ.setdefault("GFARM_HTTP_OIDC_CLIENT_ID", "openapi-contract-test")
os.environ.setdefault("GFARM_HTTP_TOKEN_VERIFY", "no")
sys.path.insert(0, str(API_DIR))

from gfarm_http_gateway import app  # noqa: E402


client = TestClient(app)
response = client.get("/openapi.json")
response.raise_for_status()
sys.stdout.write(response.text)
