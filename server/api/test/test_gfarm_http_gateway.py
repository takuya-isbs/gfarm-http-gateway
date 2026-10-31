import base64

import asyncio
from fastapi.testclient import TestClient
import pytest
import pytest_asyncio
from unittest.mock import patch, Mock, MagicMock, AsyncMock

import zipfile
import io
import time
import json
import os
from types import SimpleNamespace

import gfarm_http_gateway


client = TestClient(gfarm_http_gateway.app)

test_access_token = "TEST_access_token"
req_headers_oidc_auth = {"Authorization": f"Bearer {test_access_token}"}

user_claim = "oidc_user1"

userpass_str = "TESTUSER123:PASSWO:RD123"  # allow colon in password
userpass_b64_bin = base64.b64encode(userpass_str.encode())
userpass_b64_str = userpass_b64_bin.decode()
req_headers_basic_auth = {"Authorization": "Basic " + userpass_b64_str}

req_headers_anon_auth = {}


@pytest.mark.parametrize(
    "value, expected",
    [(True, True), (False, False), ("yes", True), ("on", True),
     ("0", False), ("no", False)],
)
def test_str2bool(value, expected):
    assert gfarm_http_gateway.str2bool(value) is expected


@pytest.mark.parametrize(
    "value, expected",
    [("a,b", ["a", "b"]), ("", [""])],
)
def test_str2list(value, expected):
    assert gfarm_http_gateway.str2list(value) == expected


@pytest.mark.parametrize(
    "value, expected",
    [(None, None), ("", None), ("none", None), ("value", "value"),
     (123, None)],
)
def test_str2none(value, expected):
    assert gfarm_http_gateway.str2none(value) == expected


def test_raise_gfarm_http_error_maps_exception_status():
    with pytest.raises(gfarm_http_gateway.HTTPException) as caught:
        gfarm_http_gateway.raise_gfarm_http_error(
            "gfls", PermissionError("permission denied"), "stdout", ["stderr"])

    assert caught.value.status_code == 403
    assert caught.value.detail == {
        "command": "gfls",
        "message": "permission denied",
        "stdout": "stdout",
        "stderr": ["stderr"],
    }


def test_load_config_from_file_filters_and_unquotes(tmp_path):
    config_file = tmp_path / "gateway.conf"
    config_file.write_text(
        'GFARM_HTTP_DEBUG="yes" # enable debug\n'
        'GFARM_HTTP_ORIGINS=http://localhost:8000,http://localhost:8080\n'
        'UNRELATED=value\n'
        'invalid line\n'
    )

    config = gfarm_http_gateway.load_config_from_file(config_file)

    assert config == {
        "GFARM_HTTP_DEBUG": "yes",
        "GFARM_HTTP_ORIGINS": "http://localhost:8000,http://localhost:8080",
    }


def test_load_config_from_env_filters_keys(monkeypatch):
    monkeypatch.setattr(
        os,
        "environ",
        {
            "GFARM_HTTP_DEBUG": "yes",
            "GFARM_HTTP_TMPDIR": "/tmp/gfarm-http-gateway",
            "UNRELATED": "value",
        },
    )

    config = gfarm_http_gateway.load_config_from_env()

    assert config == {
        "GFARM_HTTP_DEBUG": "yes",
        "GFARM_HTTP_TMPDIR": "/tmp/gfarm-http-gateway",
    }


def test_manage_tempfiles_creates_private_directories(tmp_path, monkeypatch):
    tmpdir = tmp_path / "gateway-tmp"
    monkeypatch.setattr(gfarm_http_gateway, "TMPDIR", str(tmpdir))
    monkeypatch.setattr(
        gfarm_http_gateway, "TMPDIR_TOKENS", str(tmpdir / "tokens"))
    monkeypatch.setattr(
        gfarm_http_gateway, "TMPDIR_TARTMP", str(tmpdir / "tartmp"))

    gfarm_http_gateway.manage_tempfiles()

    for path in (tmpdir, tmpdir / "tokens", tmpdir / "tartmp"):
        assert path.is_dir()
        assert (path.stat().st_mode & 0o777) == 0o700


@pytest.mark.parametrize(
    "st_uid, st_mode, message",
    [
        (os.getuid() + 1, 0o700, "must be owned"),
        (os.getuid(), 0o755, "must be private"),
    ],
)
def test_check_tempdir_mode_rejects_insecure_directory(
        monkeypatch, st_uid, st_mode, message):
    monkeypatch.setattr(gfarm_http_gateway, "TMPDIR", "/tmp/test-gateway")
    monkeypatch.setattr(os.path, "exists", lambda path: True)
    monkeypatch.setattr(
        os,
        "stat",
        lambda path: SimpleNamespace(st_uid=st_uid, st_mode=st_mode),
    )

    with pytest.raises(PermissionError, match=message):
        gfarm_http_gateway.check_tempdir_mode()


@pytest.mark.parametrize(
    "error, exception",
    [
        ("No such file or directory", FileNotFoundError),
        ("Unknown host", FileNotFoundError),
        ("Permission denied", PermissionError),
        ("Connection refused", ConnectionRefusedError),
        ("Authentication error", gfarm_http_gateway.AuthenticationError),
        ("unexpected error", RuntimeError),
    ],
)
def test_classify_gfarm_error(error, exception):
    result = gfarm_http_gateway.classify_gfarm_error([error])

    assert isinstance(result, exception)


@pytest.mark.asyncio
async def test_set_env_uses_selected_gfarm_username():
    request = Mock()
    request.client.host = "127.0.0.1"
    request.session = {
        gfarm_http_gateway.GFARM_USERNAME_SESSION_KEY: "selected-user"
    }
    access_token = "access-token"
    with patch("gfarm_http_gateway.switch_auth_from_session",
               new=AsyncMock(return_value=(
                   gfarm_http_gateway.AUTHZ_TYPE_OAUTH,
                   None,
                   access_token))):
        with patch("gfarm_http_gateway.get_user_from_access_token",
                   return_value="claim-user"):
            env = await gfarm_http_gateway.set_env(request, None)

    assert env["GFARM_SASL_USER"] == "selected-user"


@pytest.fixture
def mock_claims():
    with patch("jose.jwt.get_unverified_claims") as mock:
        mock.return_value = {
            "sub": user_claim,
        }
        yield mock


@pytest.fixture
def mock_anon():
    with patch("gfarm_http_gateway.ALLOW_ANONYMOUS") as mock:
        mock = "yes"
        yield mock


@pytest.fixture
def mock_access_token():
    with patch("gfarm_http_gateway.get_access_token") as mock:
        mock.return_value = test_access_token
        yield mock


@pytest.fixture
def mock_access_token_none():
    with patch("gfarm_http_gateway.get_access_token") as mock:
        mock.return_value = None
        yield mock


@pytest.fixture
def mock_user_passwd():
    with patch("gfarm_http_gateway.get_user_passwd") as mock:
        mock.return_value = tuple(userpass_str.split(":", 1))
        yield mock


@pytest.fixture
def mock_get_file_info():
    with patch("gfarm_http_gateway.get_file_info") as mock:
        existing = True
        is_file = True
        size = 1
        mtime = 1717232400.0
        mock.return_value = gfarm_http_gateway.FileInfo(
            exists=existing, is_file=is_file, size=size, mtime=mtime)
        yield mock


def mock_exec_common(mock, stdout, stderr, result):
    # Dummy asyncio.subprocess.Process
    mock_proc = Mock()
    mock_proc.stdin = Mock(spec=asyncio.StreamWriter)
    # mock_proc.stdin = Mock(spec=asyncio.StreamWriter()
    mock_proc.stdout = asyncio.StreamReader()
    if stdout is not None:
        mock_proc.stdout.feed_data(stdout)
    mock_proc.stdout.feed_eof()
    mock_proc.stderr = asyncio.StreamReader()
    if stderr is not None:
        mock_proc.stderr.feed_data(stderr)
    mock_proc.stderr.feed_eof()
    mock_future_wait = asyncio.Future()
    mock_proc.wait.return_value = mock_future_wait
    mock_future_wait.set_result(result)
    mock.return_value = mock_proc
    return mock


# See: https://docs.pytest.org/en/latest/example/parametrize.html#apply-indirect-on-particular-arguments  # noqa: E501
@pytest_asyncio.fixture(scope="function")
async def mock_exec(request):
    # expected parameters
    stdout, stderr, result = request.param
    with patch('asyncio.create_subprocess_exec') as mock:
        yield mock_exec_common(mock, stdout, stderr, result)


@pytest_asyncio.fixture(scope="function")
async def mock_gfstat(request):
    stdout, stderr, result = request.param
    with patch('gfarm_http_gateway.gfstat') as mock:
        yield mock_exec_common(mock, stdout, stderr, result)


@pytest_asyncio.fixture(scope="function")
async def mock_gfmv(request):
    stdout, stderr, result = request.param
    with patch('gfarm_http_gateway.gfmv') as mock:
        yield mock_exec_common(mock, stdout, stderr, result)


@pytest_asyncio.fixture(scope="function")
async def mock_gfrm(request):
    stdout, stderr, result = request.param
    with patch('gfarm_http_gateway.gfrm') as mock:
        yield mock_exec_common(mock, stdout, stderr, result)


@pytest_asyncio.fixture(scope="function")
async def mock_get_file_info_not_file(request):
    with patch("gfarm_http_gateway.get_file_info") as mock:
        existing = True
        is_file = False
        size = 1
        mock.return_value = gfarm_http_gateway.FileInfo(
            exists=existing, is_file=is_file, size=size, mtime=0)
        yield mock


@pytest_asyncio.fixture(scope="function")
async def mock_get_file_info_not_found(request):
    with patch("gfarm_http_gateway.get_file_info") as mock:
        err = FileNotFoundError("no such file or directory")
        mock.side_effect = err
        yield mock


@pytest_asyncio.fixture(scope="function")
async def mock_gfls(request):
    stdout, stderr, result = request.param
    with patch('gfarm_http_gateway.gfls') as mock:
        yield mock_exec_common(mock, stdout, stderr, result)


@pytest_asyncio.fixture(scope="function")
async def mock_gfexport(request):
    stderr, result = request.param
    with patch('gfarm_http_gateway.gfexport') as mock:
        def _gfexport_dynamic_side_effect(env_arg, filepath_arg):
            mock_proc = MagicMock()

            # stdout: simulate read() and readline()
            mock_proc.stdout = AsyncMock()
            data = filepath_arg.encode()
            mock_proc.stdout.read = AsyncMock(side_effect=[data, b""])
            mock_proc.stdout.readline = AsyncMock(side_effect=[
                filepath_arg.encode() + b"\n",  # one line
                b""  # EOF
            ])

            # stderr: simulate readline() to produce all lines
            mock_proc.stderr = AsyncMock()
            mock_proc.stderr.readline = AsyncMock(side_effect=[
                (stderr if isinstance(stderr, bytes) else stderr.encode()) +
                b"\n",  # line 1
                b""  # EOF
            ])

            mock_proc.returncode = result
            mock_proc.wait = AsyncMock(return_value=result)
            return mock_proc, filepath_arg

        mock.side_effect = _gfexport_dynamic_side_effect
        yield mock


@pytest_asyncio.fixture(scope="function")
async def mock_gfwhoami(request):
    stdout, stderr, result = request.param
    with patch('gfarm_http_gateway.gfwhoami') as mock:
        yield mock_exec_common(mock, stdout, stderr, result)


def make_mock_proc(mock, stdout: bytes, stderr: bytes, returncode: int):
    mock_proc = Mock()
    mock_proc.returncode = returncode

    # Simulate .communicate()
    async def communicate(input=None):
        return stdout, stderr
    mock_proc.communicate = AsyncMock(side_effect=communicate)

    # Simulate .wait()
    wait_future = asyncio.Future()
    wait_future.set_result(returncode)
    mock_proc.wait.return_value = wait_future

    mock.return_value = mock_proc
    return mock


@pytest_asyncio.fixture(scope="function")
async def mock_setfacl(request):
    stdout, stderr, returncode = request.param
    with patch("asyncio.create_subprocess_exec") as mock:
        make_mock_proc(mock, stdout, stderr, returncode)
        yield mock  # let test inspect it


@pytest_asyncio.fixture(scope="function")
async def mock_gfptar(request):
    stdout, stderr, result = request.param

    mock_proc = MagicMock()
    mock_proc.returncode = result
    mock_proc.wait = AsyncMock(return_value=result)

    # simulate stdout line-by-line (1 byte at a time)
    mock_proc.stdout = AsyncMock()
    b_stream = list(stdout) + [b""]
    mock_proc.stdout.read = AsyncMock(
        side_effect=[
            bytes([b]) if isinstance(b, int) else b for b in b_stream
        ])
    mock_proc.stdout.readline = AsyncMock(side_effect=[
        stdout + b"\n",
        b""
    ])

    mock_proc.stderr = AsyncMock()
    mock_proc.stderr.readline = AsyncMock(side_effect=[
        (stderr if isinstance(stderr, bytes) else stderr.encode()) + b"\n",
        b""
    ])

    with patch("gfarm_http_gateway.gfptar",
               return_value=(mock_proc, ["test"])):
        yield mock_proc


def assert_is_oidc_auth(kwargs):
    env = kwargs.get("env")
    mech = env.get("GFARM_SASL_MECHANISMS")
    assert mech == "XOAUTH2"
    user = env.get("GFARM_SASL_USER")
    assert user == user_claim


def assert_is_basic_auth(kwargs):
    env = kwargs.get("env")
    mech = env.get("GFARM_SASL_MECHANISMS")
    assert mech == "PLAIN"
    user = env.get("GFARM_SASL_USER")
    assert user == "TESTUSER123"
    passwd = env.get("GFARM_SASL_PASSWORD")
    assert passwd == "PASSWO:RD123"


def assert_is_anon_auth(kwargs):
    env = kwargs.get("env")
    mech = env.get("GFARM_SASL_MECHANISMS")
    assert mech == "ANONYMOUS"


def assert_gfarm_http_error(response, code, command, expect_msg_list, stdout):
    assert response.status_code == code
    j = response.json()
    detail = j.get("detail")
    assert detail.get("command") == command
    if expect_msg_list:
        message = detail.get("message")
        for msg in expect_msg_list:
            assert msg in message
    if stdout:
        assert detail.get("stdout") == stdout


gfstat_file_stdout = """
File: "/tmp/test.pdf"
Size: 54321         Filetype: regular file
Mode: (1777)        Uid: ( user1)  Gid: (gfarmadm)
Inode: 99999999     Gen: 9999999
                    (00000000000000030000000000000000)
Links: 2            Ncopy: 1
Access: 2025-02-10 18:27:33.191688265 +0000
Modify: 2025-02-10 18:27:31.071120060 +0000
Change: 2025-02-10 18:15:09.400000000 +0900
MetadataHost: gfmd1
MetadataPort: 601
MetadataUser: user1
"""
gfstat_dir_stdout = """
File: "/tmp"
Size: 0             Filetype: directory
Mode: (1777)        Uid: ( user1)  Gid: (gfarmadm)
Inode: 3            Gen: 5
                    (00000000000000030000000000000000)
Links: 2            Ncopy: 1
Access: 2025-02-10 18:27:33.191688265 +0000
Modify: 2025-02-10 18:27:31.071120060 +0000
Change: 2025-02-10 18:15:09.400000000 +0900
MetadataHost: gfmd1
MetadataPort: 601
MetadataUser: user1
"""
parsed_stat = {
    "File": "/tmp",
    "Size": 0,
    "Filetype": "directory",
    "Mode": "1777",
    "Uid": "user1",
    "Gid": "gfarmadm",
    "Inode": 3,
    "Gen": 5,
    "Links": 2,
    "Ncopy": 1,
    "Access": "2025-02-10 18:27:33.191688 +0000",
    "AccessSeconds": 1739212053,
    "AccessNanos": 191688265,
    "Modify": "2025-02-10 18:27:31.071120 +0000",
    "ModifySeconds": 1739212051,
    "ModifyNanos": 71120060,
    "Change": "2025-02-10 18:15:09.400000 +0900",
    "ChangeSeconds": 1739178909,
    "ChangeNanos": 400000000,
    "MetadataHost": "gfmd1",
    "MetadataPort": "601",
    "MetadataUser": "user1",
}


def parse_gfstat():
    st = gfarm_http_gateway.parse_gfstat(gfstat_dir_stdout).model_dump()
    print(st)
    assert st == parsed_stat


expect_gfwhoami_stdout = "testuser"
expect_gfwhoami = (expect_gfwhoami_stdout.encode(), b"error", 0)

expect_gfwhoami_error = (None, b"error", 1)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfwhoami], indirect=True)
async def test_whoami_oidc_auth(mock_claims, mock_exec):
    response = client.get("/conf/me", headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfwhoami',)
    assert_is_oidc_auth(kwargs)
    assert response.text == expect_gfwhoami_stdout


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfwhoami], indirect=True)
async def test_whoami_basic_auth(mock_claims, mock_exec):
    response = client.get("/conf/me", headers=req_headers_basic_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfwhoami',)
    assert_is_basic_auth(kwargs)
    assert response.text == expect_gfwhoami_stdout


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfwhoami], indirect=True)
async def test_whoami_anon_auth_enabled(mock_anon, mock_claims, mock_exec):
    # GFARM_HTTP_ALLOW_ANONYMOUS=yes
    response = client.get("/conf/me", headers=req_headers_anon_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfwhoami',)
    assert_is_anon_auth(kwargs)
    assert response.text == expect_gfwhoami_stdout


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfwhoami], indirect=True)
async def test_whoami_anon_auth_disabled(mock_claims, mock_exec):
    # GFARM_HTTP_ALLOW_ANONYMOUS=no (default)
    response = client.get("/conf/me", headers=req_headers_anon_auth)
    assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfwhoami], indirect=True)
async def test_whoami_oidc_session(mock_claims, mock_access_token, mock_exec):
    response = client.get("/conf/me")
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfwhoami',)
    assert_is_oidc_auth(kwargs)
    assert response.text == expect_gfwhoami_stdout


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfwhoami], indirect=True)
async def test_whoami_basic_session(mock_claims, mock_access_token_none,
                                    mock_user_passwd, mock_exec):
    response = client.get("/conf/me")
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfwhoami',)
    assert_is_basic_auth(kwargs)
    assert response.text == expect_gfwhoami_stdout


def test_debug_page_uses_current_api_paths(monkeypatch):
    monkeypatch.setattr(
        gfarm_http_gateway,
        "oidc_logout_url",
        AsyncMock(return_value=""),
    )

    with TestClient(gfarm_http_gateway.app) as debug_client:
        response = debug_client.get("/debug")
        script_response = debug_client.get("/static/js/gfarm.js")

    assert response.status_code == 200
    assert "gfarm-http-gateway Debug API" in response.text
    assert '<select id="ls_output_format">' in response.text
    assert '<option value="plain" selected>plain</option>' in response.text
    assert '<option value="json">json</option>' in response.text
    assert script_response.status_code == 200

    script = script_response.text
    assert "./conf/me" in script
    assert "./dir" in script
    assert '"show_hidden"' in script
    assert '"output_format"' in script
    assert 'document.getElementById("ls_output_format")' in script
    assert 'params.append("output_format", lsOutputFormat.value)' in script

    chmod_script = script.split("async function chmod()", 1)[1]
    chmod_script = chmod_script.split("async function gfptar()", 1)[0]
    assert 'method: "PUT"' in chmod_script

    gfptar_script = script.split("async function gfptar()", 1)[1]
    assert "source: [src]" in gfptar_script
    assert "options: []" in gfptar_script


expect_gfls_stdout = "test gfls stdout"
expect_gfls = ((expect_gfls_stdout).encode(), b"error", 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfls], indirect=True)
async def test_dir_list(mock_claims, mock_get_file_info_not_file, mock_exec):
    response = client.get("/dir/testdir?long_format=0&output_format=plain",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfls', '-T', '/testdir')
    lines = [line async for line in response.aiter_lines()]
    assert any(expect_gfls_stdout in line for line in lines)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfls], indirect=True)
async def test_dir_list_a(mock_claims, mock_get_file_info_not_file, mock_exec):
    response = client.get("/dir/testdir?show_hidden=1"
                          "&long_format=0&output_format=plain",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    # NOT WORK: mock_exec.assert_called_with(args=['gfls', '-a', 'testdir'])
    args, kwargs = mock_exec.call_args
    assert args == ('gfls', '-a', '-T', '/testdir')
    lines = [line async for line in response.aiter_lines()]
    assert any(expect_gfls_stdout in line for line in lines)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfls], indirect=True)
async def test_dir_list_l(mock_claims, mock_get_file_info_not_file, mock_exec):
    response = client.get("/dir/testdir?long_format=1&output_format=plain",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfls', '-l', '-T', '/testdir')
    lines = [line async for line in response.aiter_lines()]
    assert any(expect_gfls_stdout in line for line in lines)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfls], indirect=True)
async def test_dir_list_R(mock_claims, mock_get_file_info_not_file, mock_exec):
    response = client.get("/dir/testdir?recursive=1"
                          "&long_format=0&output_format=plain",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfls', '-R', '-T', '/testdir')
    assert response.text == ""


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfls], indirect=True)
async def test_dir_list_e(mock_claims, mock_get_file_info_not_file, mock_exec):
    response = client.get("/dir/testdir?effperm=1"
                          "&long_format=0&output_format=plain",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfls', '-T', '-e', '/testdir')
    lines = [line async for line in response.aiter_lines()]
    assert any(expect_gfls_stdout in line for line in lines)


expect_gfls_stdout_data = (
    b"-rw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024 \
    testfile1.txt\n"
)
gfls_success_param = (expect_gfls_stdout_data, b"", 0)

mtime = time.mktime(time.strptime("Jun 01 09:00:00 2024", '%b %d %H:%M:%S %Y'))
expect_gfls_json_stdout = {
    'mode_str': '-rw-r--r--',
    'is_file': True,
    'is_dir': False,
    'is_sym': False,
    'linkname': '',
    'nlink': 1,
    'uname': 'user',
    'gname': 'group',
    'size': 5678,
    'mtime': mtime,
    'name': 'testfile1.txt',
    'path': '/testdir/testfile1.txt',
    'perms': None
}


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [gfls_success_param], indirect=True)
async def test_dir_list_json(mock_claims, mock_get_file_info_not_file,
                             mock_exec):
    response = client.get("/dir/testdir",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfls', '-l', '-T', '/testdir')
    lines = [json.loads(line) async for line in response.aiter_lines()]
    assert expect_gfls_json_stdout in lines


expect_gfls_err_msg = "test gfls (error)"
expect_gfls_err = ((expect_gfls_err_msg + "\n").encode(), b"error", 1)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfls_err], indirect=True)
async def test_dir_list_err(mock_claims, mock_get_file_info_not_file,
                            mock_exec):
    response = client.get("/dir/testdir?long_format=0&output_format=plain",
                          headers=req_headers_oidc_auth)
    # assert_gfarm_http_error(response, 500, "gfls", None, expect_gfls_err_msg)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfls', '-T', '/testdir')
    lines = [line async for line in response.aiter_lines()]
    assert any(expect_gfls_err_msg in line for line in lines)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfls_err], indirect=True)
async def test_dir_list_ign_err(mock_claims, mock_get_file_info_not_file,
                                mock_exec):
    response = client.get("/dir/testdir?ign_err=1"
                          "&long_format=0&output_format=plain",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfls', '-T', '/testdir')
    lines = [line async for line in response.aiter_lines()]
    assert any(expect_gfls_err_msg in line for line in lines)


no_stdout = ""
expect_no_stdout = (no_stdout.encode(), b"", 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
async def test_dir_create(mock_claims, mock_exec):
    response = client.put("/dir/a/testdir", headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfmkdir', '/a/testdir')
    assert response.text == no_stdout


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
async def test_dir_remove(mock_claims, mock_exec):
    response = client.delete("/dir/testdir", headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfrmdir', '/testdir')
    assert response.text == no_stdout


gfexport_stdout = b"test output data"
expect_gfexport = (gfexport_stdout, b"", 0)
expect_gfstat = (gfstat_file_stdout.encode(), b"", 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfstat", [expect_gfstat], indirect=True)
@pytest.mark.parametrize("mock_exec", [expect_gfexport], indirect=True)
async def test_file_export(mock_claims, mock_gfstat, mock_exec):
    response = client.get("/file/a/testfile.txt",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfexport', '/a/testfile.txt')
    assert response.content == gfexport_stdout


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfmv", [expect_no_stdout], indirect=True)
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
async def test_file_import(mock_claims, mock_gfmv, mock_exec):
    input_data = b"test data"
    response = client.put("/file/a/testfile.txt",
                          content=input_data,
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    assert response.text == no_stdout
    gfreg_proc = mock_exec.return_value
    written_data = b"".join([call.args[0] for call in
                             gfreg_proc.stdin.write.call_args_list])
    assert written_data == input_data
    args, kwargs = mock_exec.call_args
    assert args[0] == 'gfreg'
    args, kwargs = mock_gfmv.call_args
    assert args[2] == '/a/testfile.txt'


expect_gfreg_err = (b"", b"error", 1)


def repeat_str(text, length):
    repeated_string = ""
    while len(repeated_string) < length:
        repeated_string += text
    return repeated_string[:length]


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfrm", [expect_no_stdout], indirect=True)
@pytest.mark.parametrize("mock_exec", [expect_gfreg_err], indirect=True)
async def test_file_import_err(mock_claims, mock_gfrm, mock_exec):
    MAXNAMELEN = 255
    MAXVIEWNAMELEN = 128
    fname = "/dir/" + repeat_str("abcde", MAXNAMELEN)
    input_data = b"input data2"
    response = client.put(f"/file{fname}",
                          content=input_data,
                          headers=req_headers_oidc_auth)
    expect_msg_list = ["Failed to execute: gfreg",
                       repeat_str("abcde", MAXVIEWNAMELEN)]
    assert_gfarm_http_error(response, 500, "gfreg", expect_msg_list, None)
    gfreg_proc = mock_exec.return_value
    written_data = b"".join([call.args[0] for call in
                             gfreg_proc.stdin.write.call_args_list])
    assert written_data == input_data

    args, kwargs = mock_exec.call_args
    assert args[0] == 'gfreg'
    assert len(args[1]) < MAXNAMELEN

    args, kwargs = mock_gfrm.call_args
    assert len(args[1]) < MAXNAMELEN
    assert kwargs["force"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
async def test_file_remove(mock_claims, mock_exec):
    response = client.delete("/file/test.pptx", headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfrm', '/test.pptx')
    assert response.text == no_stdout


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
async def test_file_remove_with_args(mock_claims, mock_exec):
    response = client.delete("/file/test.pptx?force=on&recursive=on",
                             headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfrm', '-f', '-r', '/test.pptx')
    assert response.text == no_stdout


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
async def test_move_rename(mock_claims, mock_exec):
    src = "/dir1/file1.txt"
    dest = "/dir2/file2.txt"
    move = {
        "source": src,
        "destination": dest
    }
    response = client.post("/move",
                           json=move,
                           headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfmv', src, dest)
    assert response.text == no_stdout


expect_gfstat = (gfstat_dir_stdout.encode(), b"", 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [(expect_gfstat)], indirect=True)
async def test_get_attr(mock_claims, mock_exec):
    response = client.get("/attr/dir/testfile.txt",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfstat', '-M', '/dir/testfile.txt')
    assert response.json() == parsed_stat


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
async def test_change_attr(mock_claims, mock_exec):
    mode = "1750"
    update_stat = {
        "Mode": mode,
    }
    response = client.put("/attr/dir/file1.mp4",
                          json=update_stat,
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfchmod', mode, "/dir/file1.mp4")
    assert response.text == no_stdout


expect_gfuser_stdout = "testuser:testuser:/home:test"
expect_gfuser = (expect_gfuser_stdout.encode(), b"error", 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfwhoami", [expect_gfwhoami], indirect=True)
@pytest.mark.parametrize("mock_exec", [expect_gfuser], indirect=True)
async def test_user_info_with_access_token(mock_claims, mock_exec,
                                           mock_gfwhoami, mock_access_token):
    response = client.get("/user_info",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    json = response.json()
    assert json["username"] == expect_gfwhoami_stdout


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfwhoami", [expect_gfwhoami], indirect=True)
@pytest.mark.parametrize("mock_exec", [expect_gfuser], indirect=True)
async def test_user_info_with_password(mock_claims, mock_exec,
                                       mock_gfwhoami, mock_user_passwd):
    response = client.get("/user_info",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    json = response.json()
    assert json["username"] == expect_gfwhoami_stdout


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfwhoami",
                         [expect_gfwhoami_error], indirect=True)
async def test_user_info_None(mock_claims, mock_gfwhoami):
    response = client.get("/user_info",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 401


expect_gfls_stdout_data1 = (
    b'drwxr-xr-x 4 user group 0 Jul 25 04:13:58 2025 .\n'
    b'drwxrwxr-x 5 user group 4 Jul 25 04:14:43 2025 ..\n'
    b"-rw-r--r-- 1 user group 6686 Mar 31 17:20:10 2025 file_a.txt\n"
    b"-rw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024 file_b.txt\n"
    b"drw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024 test\n"
    b"\n"
    b"./testdir/test:\n"
    b"drw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024 test2\n"
    b"lrw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024\
    symlink -> ./test\n"
    b"\n"
    b"./testdir/test/test2:\n"
    b"-rw-r--r-- 1 user group 1234 May 20 15:30:00 2024 file_c.txt\n"
)
gfls_success_param1 = (expect_gfls_stdout_data1, b"", 0)


async def zip_export_check(paths, expect_names, expect_contents):
    test_files = {"paths": paths}

    response = client.post("/zip",
                           headers=req_headers_oidc_auth,
                           data=test_files)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "attachment; filename=" in response.headers["content-disposition"]
    assert response.headers["content-disposition"].endswith(".zip\"")

    zip_content = b""
    async for chunk in response.aiter_bytes():
        zip_content += chunk

    zip_buffer = io.BytesIO(zip_content)

    with zipfile.ZipFile(zip_buffer, 'r') as zf:
        namelist = zf.namelist()
        print(f"Zip file contains: {namelist}")

        for i in range(0, len(expect_names)):
            assert expect_names[i] in namelist

            if not expect_names[i].endswith('.txt'):
                continue

            with zf.open(expect_names[i], 'r') as f:
                content = f.read().decode()
                assert expect_contents[i] in content


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfls",
                         [gfls_success_param1], indirect=True)
@pytest.mark.parametrize("mock_gfexport", [(b"", 0)], indirect=True)
# @pytest.mark.parametrize("mock_exec", [expect_gfexport], indirect=True)
async def test_zip_export_file_and_directory(
        mock_claims,
        mock_get_file_info_not_file,
        mock_gfls,
        mock_gfexport):
    expected_zip_paths = [
        "testdir/file_a.txt",
        "testdir/file_b.txt",
        "testdir/test/",
        "testdir/test/test2/",
        "testdir/test/symlink",
        "testdir/test/test2/file_c.txt"
    ]
    await zip_export_check(["/testdir"],
                           expected_zip_paths,
                           expected_zip_paths)


expect_gfls_stdout_data2 = (
    b"drw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024 test\n"
    b"\n"
    b"./testdir/test:\n"
    b"drw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024 test2\n"
    b"\n"
    b"./testdir/test/test2:\n"
    b"drw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024 test3\n"
    b"\n"
    b"./testdir/test/test2/test3:\n"
    b"drw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024 test4\n"
    b"\n"
    b"./testdir/test/test2/test3/test4:\n"
    b"drw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024 test5\n"
    b"\n"
    b"./testdir/test/test2/test3/test4/test5:\n"
    b"-rw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024 test6.txt\n"
)
gfls_success_param2 = (expect_gfls_stdout_data2, b"", 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfls",
                         [gfls_success_param2], indirect=True)
@pytest.mark.parametrize("mock_gfexport", [(b"", 0)], indirect=True)
async def test_zip_export_nest_directory(
        mock_claims,
        mock_get_file_info_not_file,
        mock_gfls,
        mock_gfexport):
    expected_zip_paths = [
        "testdir/test/",
        "testdir/test/test2/",
        "testdir/test/test2/test3/",
        "testdir/test/test2/test3/test4/",
        "testdir/test/test2/test3/test4/test5/",
        "testdir/test/test2/test3/test4/test5/test6.txt",
    ]
    await zip_export_check(["/testdir"],
                           expected_zip_paths,
                           expected_zip_paths)


expect_gfls_stdout_data3 = (
    b"-rw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024 \
    ./tmp/testdir/testfile1.txt\n"
)
gfls_success_param3 = (expect_gfls_stdout_data3, b"", 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfls",
                         [gfls_success_param3], indirect=True)
@pytest.mark.parametrize("mock_gfexport", [(b"", 0)], indirect=True)
async def test_zip_export_file(
        mock_claims,
        mock_get_file_info,
        mock_gfls,
        mock_gfexport):
    expected_zip_paths = [
        "testfile1.txt",
    ]
    expected_contents = [
        "/tmp/testdir/testfile1.txt",
    ]
    await zip_export_check(
        ["/tmp/testdir/testfile1.txt"],
        expected_zip_paths,
        expected_contents
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfls",
                         [gfls_success_param], indirect=True)
@pytest.mark.parametrize("mock_gfexport", [(b"", 0)], indirect=True)
async def test_zip_export_file_not_found(
        mock_claims,
        mock_get_file_info_not_found,
        mock_gfls,
        mock_gfexport):
    test_files = {"paths": ["testdir"]}

    response = client.post("/zip",
                           headers=req_headers_oidc_auth,
                           data=test_files)

    assert response.status_code == 404


expect_gfls_stdout_data4 = (
    b"no such file or directory\n"
)
gfls_error_param = (expect_gfls_stdout_data4, b"", 1)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfls",
                         [gfls_error_param], indirect=True)
@pytest.mark.parametrize("mock_gfexport", [(b"", 0)], indirect=True)
async def test_zip_export_gfls_error(
        mock_claims,
        mock_get_file_info,
        mock_gfls,
        mock_gfexport):
    test_files = {"paths": ["/tmp/testdir/testfile1.txt"]}
    expected_filename = "testfile1.txt"
    response = client.post("/zip",
                           headers=req_headers_oidc_auth,
                           data=test_files)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "attachment; filename=" in response.headers["content-disposition"]
    assert response.headers["content-disposition"].endswith(".zip\"")

    zip_content = b""
    async for chunk in response.aiter_bytes():
        zip_content += chunk

    zip_buffer = io.BytesIO(zip_content)

    with zipfile.ZipFile(zip_buffer, 'r') as zf:
        namelist = zf.namelist()
        print(f"Zip file contains: {namelist}")
        assert expected_filename not in namelist


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfls",
                         [gfls_success_param3], indirect=True)
@pytest.mark.parametrize("mock_exec", [(b"", b"error", 1)], indirect=True)
async def test_zip_export_gfexport_error(
        mock_claims,
        mock_get_file_info,
        mock_gfls,
        mock_exec):
    test_files = {"paths": ["/tmp/testdir/testfile1.txt"]}
    expected_filename = "testfile1.txt"
    expected_content = "/tmp/testdir/testfile1.txt"
    response = client.post("/zip",
                           headers=req_headers_oidc_auth,
                           data=test_files)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "attachment; filename=" in response.headers["content-disposition"]
    assert response.headers["content-disposition"].endswith(".zip\"")

    zip_content = b""
    async for chunk in response.aiter_bytes():
        zip_content += chunk

    zip_buffer = io.BytesIO(zip_content)

    with zipfile.ZipFile(zip_buffer, 'r') as zf:
        namelist = zf.namelist()
        print(f"Zip file contains: {namelist}")
        assert expected_filename in namelist
        with zf.open(expected_filename, 'r') as f:
            content = f.read().decode()
            print(f"Zip file content: {content}")
            assert expected_content not in content


expect_gfgetfacl_stdout = """# file: testfile.txt
# owner: user
# group: group
user::rwx
group::r-x
other::r-x
"""

expect_gfgetfacl = (expect_gfgetfacl_stdout.encode(), b"", 0)

parsed_acl = {
    'acl': [
        {
            'acl_type': 'user',
            'acl_name': None,
            'acl_perms': {'r': True, 'w': True, 'x': True},
            'is_default': False
        },
        {
            'acl_type': 'group',
            'acl_name': None,
            'acl_perms': {'r': True, 'w': False, 'x': True},
            'is_default': False
        },
        {
            'acl_type': 'other',
            'acl_name': None,
            'acl_perms': {'r': True, 'w': False, 'x': True},
            'is_default': False
        }
    ]
}


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [(expect_gfgetfacl)], indirect=True)
async def test_get_acl(mock_claims, mock_exec):
    response = client.get("/acl/dir/testfile.txt",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfgetfacl', '/dir/testfile.txt')
    assert response.json() == parsed_acl


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_setfacl", [expect_no_stdout], indirect=True)
async def test_set_acl(mock_claims, mock_setfacl):
    response = client.put("/acl/dir/testfile.txt",
                          json=parsed_acl,
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_setfacl.call_args
    assert args == ('gfsetfacl', '-b', '-M', '-', '/dir/testfile.txt')
    assert response.text == no_stdout


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfuser], indirect=True)
async def test_get_users(mock_claims, mock_exec):
    response = client.get("/users",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfuser', )
    assert response.json()["list"] == [expect_gfuser_stdout]


parsed_userlist = [{
    'home_directory': '/home',
    'id': 'testuser',
    'identifier': 'test',
    'name': 'testuser'
}]


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfuser], indirect=True)
async def test_get_users_with_long_format(mock_claims, mock_exec):
    response = client.get("/users?long_format=on",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfuser', '-l')
    assert response.json()["list"] == parsed_userlist


expect_gfgroup_stdout = "testgroup:testuser"
expect_gfgroup = (expect_gfgroup_stdout.encode(), b"error", 0)
parsed_grouplist = [{'group': 'testgroup', 'menbers': 'testuser'}]


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfgroup], indirect=True)
async def test_get_groups(mock_claims, mock_exec):
    response = client.get("/groups",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfgroup', )
    assert response.json()["list"] == [expect_gfgroup_stdout]


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_gfgroup], indirect=True)
async def test_get_group_with_long_format(mock_claims, mock_exec):
    response = client.get("/groups?long_format=on",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfgroup', '-l')
    assert response.json()["list"] == parsed_grouplist


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
async def test_create_symlink(mock_claims, mock_exec):
    src = "/dir1/file1.txt"
    dest = "/dir2/file2.txt"
    move = {
        "source": src,
        "destination": dest
    }
    response = client.post("/symlink",
                           json=move,
                           headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfln', '-s', src, dest)
    assert response.text == no_stdout


expect_gfls_stdout_owndata = (
    b"-rw-r--r-- 1 user group 5678 Jun 01 09:00:00 2024 .\n"
)
gfls_success_param_own = (expect_gfls_stdout_owndata, b"", 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_exec", [(expect_gfstat)], indirect=True)
@pytest.mark.parametrize("mock_gfls",
                         [gfls_success_param_own], indirect=True)
async def test_get_symlink(mock_claims, mock_exec, mock_gfls):
    response = client.get("/symlink/testdir/testfile1.txt",
                          headers=req_headers_oidc_auth)
    assert response.status_code == 200
    args, kwargs = mock_exec.call_args
    assert args == ('gfstat', '/testdir/testfile1.txt')
    assert response.json() == expect_gfls_json_stdout


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfexport", [(b"", 0)], indirect=True)
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
@pytest.mark.parametrize("mock_gfmv", [expect_no_stdout], indirect=True)
async def test_file_copy(
    mock_claims,
    mock_get_file_info,
    mock_gfmv,
    mock_exec,
    mock_gfexport
):
    copy_data = {
        "source": "/dir1/file1.txt",
        "destination": "/dir2/file2.txt",
    }

    response = client.put("/copy",
                          json=copy_data,
                          headers=req_headers_oidc_auth)

    assert response.status_code == 200
    lines = [line async for line in response.aiter_lines()]
    assert any('"copied":' in line for line in lines)
    assert any('"done": true' in line.lower() for line in lines)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfptar", [(b"creating...\n", b"", 0)],
                         indirect=True)
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
async def test_gfptar_create(
    mock_claims,
    mock_get_file_info_not_found,
    mock_exec,
    mock_gfptar
):
    tar_data = {
        "command": "create",
        "basedir": "/source/dir",
        "source": ["file1.txt", "file2.txt"],
        "outdir": "/dest/dir",
        "options": []
    }

    response = client.post("/gfptar",
                           json=tar_data,
                           headers=req_headers_oidc_auth)

    assert response.status_code == 200
    lines = [line async for line in response.aiter_lines()]
    assert any("creating..." in line for line in lines)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfptar", [(b"updating...\n", b"", 0)],
                         indirect=True)
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
async def test_gfptar_update(
    mock_claims,
    mock_get_file_info,
    mock_exec,
    mock_gfptar
):
    tar_data = {
        "command": "update",
        "basedir": "/source/dir",
        "source": ["file1.txt", "file2.txt"],
        "outdir": "/dest/dir",
        "options": []
    }

    response = client.post("/gfptar",
                           json=tar_data,
                           headers=req_headers_oidc_auth)

    assert response.status_code == 200
    lines = [line async for line in response.aiter_lines()]
    assert any("updating..." in line for line in lines)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfptar", [(b"appending...\n", b"", 0)],
                         indirect=True)
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
async def test_gfptar_append(
    mock_claims,
    mock_get_file_info,
    mock_exec,
    mock_gfptar
):
    tar_data = {
        "command": "append",
        "basedir": "/source/dir",
        "source": ["file1.txt", "file2.txt"],
        "outdir": "/dest/dir",
        "options": []
    }

    response = client.post("/gfptar",
                           json=tar_data,
                           headers=req_headers_oidc_auth)

    assert response.status_code == 200
    lines = [line async for line in response.aiter_lines()]
    assert any("appending..." in line for line in lines)


@pytest.mark.asyncio
@pytest.mark.parametrize("mock_gfptar", [(b"", b"error!", 0)],
                         indirect=True)
@pytest.mark.parametrize("mock_exec", [expect_no_stdout], indirect=True)
async def test_gfptar_error(
    mock_claims,
    mock_get_file_info,
    mock_exec,
    mock_gfptar
):
    tar_data = {
        "command": "append",
        "basedir": "/source/dir",
        "source": ["file1.txt", "file2.txt"],
        "outdir": "/dest/dir",
        "options": []
    }

    response = client.post("/gfptar",
                           json=tar_data,
                           headers=req_headers_oidc_auth)

    assert response.status_code == 500
    lines = [line async for line in response.aiter_lines()]
    assert any("error!" in line for line in lines)


# MEMO: How to use arguments of patch() instead of pytest.mark.parametrize
# class patch_exec(object):
#     def __init__(self, stdout=None, stderr=None):
#         self.stdout = stdout
#         self.stderr = stderr
#         self.patch = patch('asyncio.create_subprocess_exec')

#     def __enter__(self):
#         mock = self.patch.__enter__()

#         # Dummy asyncio.subprocess.Process
#         mock_proc = Mock()
#         mock_proc.stdout = asyncio.StreamReader()
#         if self.stdout is not None:
#             mock_proc.stdout.feed_data(self.stdout)
#         mock_proc.stdout.feed_eof()
#         mock_proc.stderr = asyncio.StreamReader()
#         if self.stderr is not None:
#             mock_proc.stderr.feed_data(self.stderr)
#         mock_proc.stderr.feed_eof()
#         mock_future_wait = asyncio.Future()
#         mock_proc.wait.return_value = mock_future_wait
#         mock_future_wait.set_result(0)
#         mock.return_value = mock_proc
#         return mock

#     def __exit__(self, *exc_info):
#         return self.patch.__exit__(*exc_info)


# @pytest.mark.asyncio
# async def test_whoami0(mock_claims):
#     with patch_exec(stdout=b'testuser'):
#         response = client.get("/conf/me", headers=req_headers_oidc)
#         assert response.status_code == 200
#         assert response.text == "testuser"
#         # assert response.json() == {"name": "Test"}
