#!/usr/bin/env bash
set -Eeuo pipefail

# Integration test of gfarm-http-gateway against the docker/dist Gfarm services.
#
# Usage: see the "make test" section of docker/dist/http-gateway/README.md in
# the gfarm repository. Normally run it from that directory with:
#   GFARM_HTTP_TEST_PASSWORD=... make test
# The docker/dist services (Gateway, Keycloak, JWT Server, gfarm-c1) must be
# running before this script is started.
#
# Path variables are prefixed by where the path exists:
#   gfarm_      a path in the Gfarm file system (accessed through gfarm-http)
#   container_  a path inside the client container (gfarm-c1)
#   host_       a path on the Docker host
#   playwright_ a path inside the Playwright container

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
gateway_root=$(cd -- "${script_dir}/../.." && pwd)
react_app_dir="${gateway_root}/server/frontend/app/react-app"
host_fixture="${react_app_dir}/tests/data/docker-dist-upload.txt"
playwright_fixture="/workspace/${host_fixture#"${gateway_root}/"}"

default_test_image=mcr.microsoft.com/playwright:v1.64.1-noble
docker_dist_client=${DOCKER_DIST_CLIENT:-gfarm-c1}
docker_dist_user=${DOCKER_DIST_USER:-${USER:-$(id -un)}}
gateway_url=${GFARM_HTTP_GATEWAY_URL:-http://gfarm-http-gateway-http:8000}
test_username=${GFARM_HTTP_TEST_USERNAME:-user1}
test_password=${GFARM_HTTP_TEST_PASSWORD:-}
test_image=${PLAYWRIGHT_DOCKER_IMAGE:-${default_test_image}}
docker_dist_network=${DOCKER_DIST_NETWORK:-gfarm_net}
jwt_server_url=${JWT_SERVER_URL:-https://jwt-server/}

if [[ -z "${test_password}" ]]; then
    echo "Set GFARM_HTTP_TEST_PASSWORD to the docker/dist Keycloak test" \
        "user's password." >&2
    exit 2
fi
# Pass the password to containers by name (--env NAME) so that its value
# never appears in argv.
export GFARM_HTTP_TEST_PASSWORD="${test_password}"

if ! docker inspect --format '{{.State.Running}}' \
    "${docker_dist_client}" | grep -qx true; then
    echo "docker/dist client container is not running:" \
        "${docker_dist_client}" >&2
    exit 2
fi

# Each test works under its own directory, gfarm_test_root/<test function name>.
# gfarm_test_root has a random name for every run and is removed on exit.
random_suffix=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
gfarm_test_root="/tmp/gfarm-http-gateway-test-${random_suffix}"
cli_uploaded_file="from-client.txt"
web_uploaded_file=$(basename "${host_fixture}")
container_workdir="/tmp/gfarm-http-gateway-test-client-${random_suffix}"
container_source_dir="${container_workdir}/client"
container_source="${container_workdir}/${cli_uploaded_file}"
container_download="${container_workdir}/${web_uploaded_file}"
container_gfarm_http="${container_source_dir}/gfarm-http"
gfarm_test_directory="${gfarm_test_root}/webui"
playwright_passphrase_file="/run/gfarm-test-secrets/jwt-passphrase"
host_download=$(mktemp)
host_secret_dir=$(mktemp -d)
host_passphrase_file="${host_secret_dir}/jwt-passphrase"
touch "${host_passphrase_file}"
chmod 0600 "${host_passphrase_file}"

results=()
failed_count=0

client() {
    docker exec \
        --user "${docker_dist_user}" \
        --env "GFARM_HTTP_URL=${gateway_url}" \
        "${docker_dist_client}" \
        "${container_gfarm_http}" "$@"
}

cleanup() {
    client rm -r -f "${gfarm_test_root}" >/dev/null 2>&1 || true
    docker exec "${docker_dist_client}" \
        rm -rf "${container_workdir}" >/dev/null 2>&1 || true
    rm -f "${host_download}"
    rm -rf "${host_secret_dir}"
}
trap cleanup EXIT

# ---- Preparation: not tests; a failure here stops the run ----------------

prepare_gfarm_http() {
    local build_cmd

    echo "[PREP] Building gfarm-http from this checkout in" \
        "${docker_dist_client}..."
    docker exec --user "${docker_dist_user}" "${docker_dist_client}" \
        mkdir -p "${container_workdir}"
    docker cp "${gateway_root}/client" \
        "${docker_dist_client}:${container_workdir}"
    # The client test script resolves ../gfarm-http from client/test; build
    # here so it cannot pick up a stale ignored binary from the container.
    build_cmd="cd '${container_source_dir}' &&"
    build_cmd+=" go build -o '${container_gfarm_http}' ./cmd/gfarm-http"
    docker exec "${docker_dist_client}" \
        sh -c "${build_cmd}"
}

prepare_playwright_image() {
    if docker image inspect "${test_image}" >/dev/null 2>&1; then
        echo "[PREP] Playwright test image ${test_image} is available."
    else
        echo "[PREP] Pulling Playwright test image ${test_image}..."
        docker pull "${test_image}"
    fi
}

# Gets a fresh JWT passphrase from the JWT Server login page. Playwright is
# only the tool that drives the login page here; the passphrase is written
# to a file for the CLI.
prepare_jwt_passphrase() {
    echo "[PREP] Obtaining a fresh JWT passphrase from the JWT Server" \
        "login page (Playwright helper)..."
    docker run --rm --init --ipc=host \
        --network "${docker_dist_network}" \
        --volume "${gateway_root}:/workspace:ro" \
        --volume "${host_secret_dir}:/run/gfarm-test-secrets:rw" \
        --workdir /workspace/server/frontend/app/react-app \
        --env "GFARM_HTTP_TEST_USERNAME=${test_username}" \
        --env GFARM_HTTP_TEST_PASSWORD \
        --env "GFARM_HTTP_JWT_PASSPHRASE_FILE=${playwright_passphrase_file}" \
        --env "JWT_SERVER_URL=${jwt_server_url}" \
        "${test_image}" \
        ./node_modules/.bin/playwright test \
            --config=playwright.jwt-server.config.js \
            --output=/tmp/gfarm-http-gateway-jwt-playwright-results
}

# Gives the test user's credential to jwt-agent in the client container.
prepare_cli_credential() {
    echo "[PREP] Stopping the existing jwt-agent in ${docker_dist_client}..."
    # Ignore the exit status: no running jwt-agent must not fail the run.
    # (Not verified against every agent state.)
    docker exec --user "${docker_dist_user}" "${docker_dist_client}" \
        jwt-agent --stop >/dev/null 2>&1 || true

    echo "[PREP] Starting jwt-agent in ${docker_dist_client}" \
        "with the generated passphrase..."
    docker exec -i --user "${docker_dist_user}" "${docker_dist_client}" \
        jwt-agent -s "${jwt_server_url}" -l "${test_username}" \
        <"${host_passphrase_file}" >/dev/null
    rm -f "${host_passphrase_file}"
}

prepare_test_root() {
    echo "[PREP] Creating the test directory ${gfarm_test_root}..."
    client mkdir "${gfarm_test_root}"
}

# ---- Tests: each one depends only on the preparation, not on other tests --

# [CLI] Run the client's own real-Gfarm suite. It reports each operation
# separately and cleans up its unique test directory.
test_cli_operations() {
    echo "  - Running client/test/gfarm-http-test.sh in ${docker_dist_client}..."
    docker exec \
        --user "${docker_dist_user}" \
        --env "GFARM_HTTP_URL=${gateway_url}" \
        "${docker_dist_client}" \
        sh -c "cd '${container_source_dir}' && ./test/gfarm-http-test.sh /tmp"
}

# [Web UI] Keycloak login, a file uploaded by the CLI is listed, and a Web UI
# upload is downloaded by the CLI and compared with the fixture. The CLI
# upload is preparation for the check.
test_webui_login_and_upload() {
    local gfarm_dir="${gfarm_test_root}/${FUNCNAME[0]}"

    echo "  - Preparing a CLI-uploaded file in ${gfarm_dir}..."
    docker cp "${host_fixture}" "${docker_dist_client}:${container_source}"
    client mkdir "${gfarm_dir}"
    client upload "${container_source}" "${gfarm_dir}/${cli_uploaded_file}"

    echo "  - Logging in to the Web UI, checking the CLI-uploaded file," \
        "and uploading a file (Playwright)..."
    docker run --rm --init --ipc=host \
        --network "${docker_dist_network}" \
        --volume "${gateway_root}:/workspace:ro" \
        --workdir /workspace/server/frontend/app/react-app \
        --env "GFARM_HTTP_GATEWAY_URL=${gateway_url}" \
        --env "GFARM_HTTP_TEST_USERNAME=${test_username}" \
        --env GFARM_HTTP_TEST_PASSWORD \
        --env "GFARM_HTTP_TEST_DIRECTORY=${gfarm_dir}" \
        --env "GFARM_HTTP_CLIENT_UPLOADED_FILENAME=${cli_uploaded_file}" \
        --env "GFARM_HTTP_WEB_UPLOADED_FILENAME=${web_uploaded_file}" \
        --env "GFARM_HTTP_TEST_UPLOAD_FILE=${playwright_fixture}" \
        "${test_image}" \
        ./node_modules/.bin/playwright test \
            --config=playwright.docker-dist.config.js \
            --output=/tmp/gfarm-http-gateway-playwright-results

    echo "  - Downloading the Web UI upload with gfarm-http and" \
        "comparing it with the fixture..."
    client download "${gfarm_dir}/${web_uploaded_file}" "${container_download}"
    docker cp "${docker_dist_client}:${container_download}" "${host_download}"
    cmp "${host_fixture}" "${host_download}"
}

# [Web UI] Exercise the main file operations against real Gfarm through the
# browser. Fixtures are created by gfarm-http and removed with gfarm_test_root.
test_webui_operations() {
    local seed_names=(
        download-source.txt copy-source.txt move-source.txt rename-source.txt
        delete-source.txt detail-source.txt permission-source.txt acl-source.txt
        archive-one.txt archive-two.txt
    )
    local name

    echo "  - Seeding ${gfarm_test_directory} with gfarm-http..."
    docker cp "${host_fixture}" "${docker_dist_client}:${container_source}"
    client mkdir -p "${gfarm_test_directory}/symlink-target"
    for name in "${seed_names[@]}"; do
        client upload "${container_source}" "${gfarm_test_directory}/${name}"
    done
    client upload "${container_source}" \
        "${gfarm_test_directory}/symlink-target/target-file.txt"

    echo "  - Running real-Gfarm Web UI operation cases (Playwright)..."
    docker run --rm --init --ipc=host \
        --network "${docker_dist_network}" \
        --volume "${gateway_root}:/workspace:ro" \
        --workdir /workspace/server/frontend/app/react-app \
        --env "GFARM_HTTP_GATEWAY_URL=${gateway_url}" \
        --env "GFARM_HTTP_TEST_USERNAME=${test_username}" \
        --env GFARM_HTTP_TEST_PASSWORD \
        --env "GFARM_HTTP_TEST_DIRECTORY=${gfarm_test_directory}" \
        --env "GFARM_HTTP_TEST_UPLOAD_FILE=${playwright_fixture}" \
        "${test_image}" \
        ./node_modules/.bin/playwright test \
            --config=playwright.docker-dist.operations.config.js \
            --output=/tmp/gfarm-http-gateway-operations-results
}

# Runs one test in a subshell so that its failure is recorded instead of
# ending the run. Call it as a plain command (not in if/||) so that set -e
# applies inside the test.
run_test() {
    local index=$1 total=$2 name=$3 fn=$4
    local rc=0

    echo
    echo "[TEST ${index}/${total}] ${name}"
    set +e
    ( set -e; "${fn}" )
    rc=$?
    set -e

    if (( rc == 0 )); then
        echo "[TEST ${index}/${total}] PASS"
        results+=("PASS  ${index}/${total}  ${name}")
    else
        echo "[TEST ${index}/${total}] FAIL (exit status ${rc})"
        results+=("FAIL  ${index}/${total}  ${name}")
        failed_count=$((failed_count + 1))
    fi
}

print_summary() {
    local total=${#results[@]}
    local passed_count=$(( total - failed_count ))

    echo
    echo "==== Summary ===="
    printf '  %s\n' "${results[@]}"
    echo "Result: ${passed_count} passed, ${failed_count} failed"
    (( failed_count == 0 ))
}

main() {
    local total=3
    local names=(
        "[CLI] gfarm-http operation suite"
        "[Web UI] login, CLI file, and Web UI upload checked by CLI download"
        "[Web UI] Gfarm file operations"
    )
    local fns=(
        test_cli_operations
        test_webui_login_and_upload
        test_webui_operations
    )
    local i

    prepare_gfarm_http
    prepare_playwright_image
    prepare_jwt_passphrase
    prepare_cli_credential
    prepare_test_root

    # The tests are independent: every test runs, even if an earlier one failed.
    for i in "${!fns[@]}"; do
        run_test $((i + 1)) "${total}" "${names[$i]}" "${fns[$i]}"
    done

    print_summary
}

main "$@"
