#!/usr/bin/env bash
set -Eeuo pipefail

# Integration test of gfarm-http-gateway against the docker/dist Gfarm services.
#
# Usage: see the docker/dist/http-gateway/README.md in the Gfarm repository.
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
docker_host_user=${USER:-$(id -un)}
container_checkout_client="/home/${docker_host_user}/gfarm/$(basename "${gateway_root}")/client"
docker_dist_workdir="/home/${docker_host_user}/gfarm/docker/dist"
gateway_url=${GFARM_HTTP_GATEWAY_URL:-http://gfarm-http-gateway-http:8000}
test_username=${GFARM_HTTP_TEST_USERNAME:-user1}
test_password=${GFARM_HTTP_TEST_PASSWORD:-}
test_image=${PLAYWRIGHT_DOCKER_IMAGE:-${default_test_image}}
docker_dist_network=${DOCKER_DIST_NETWORK:-gfarm_net}
jwt_server_url=${JWT_SERVER_URL:-https://jwt-server/}
playwright_cache_home=${GFARM_HTTP_PLAYWRIGHT_CACHE_HOME:-${XDG_CACHE_HOME:-${HOME}/.cache}}
playwright_cache_dir="${playwright_cache_home}/gfarm-http-gateway/playwright"
playwright_container_app_dir="/workspace/server/frontend/app/react-app"
playwright_install_app=
playwright_node_modules_cache=
mode=all
webui_case=${GFARM_HTTP_WEBUI_CASE:-}
declare -A webui_case_fixture_paths=(
    ["real Keycloak login and Gfarm file sharing with gfarm-http"]=""
    ["GET /user_info and GET /dir/{path}: list Gfarm directory"]="download-source.txt symlink-target/"
    ["PUT /dir/{path}: create a Gfarm directory"]=""
    ["DELETE /file/{path} (recursive=on): delete a Gfarm directory through the Web UI"]=""
    ["PUT /file/{path}: upload a file to Gfarm"]=""
    ["GET /file/{path}: download a Gfarm file"]="download-source.txt"
    ["POST /zip: download multiple Gfarm files as a ZIP"]="archive-one.txt archive-two.txt"
    ["POST /zip: download a Gfarm directory as a ZIP"]="symlink-target/target-file.txt"
    ["PUT /copy: copy a Gfarm file"]="copy-source.txt"
    ["POST /move: move a Gfarm file to another directory"]="move-source.txt symlink-target/"
    ["POST /move: rename a Gfarm file"]="rename-source.txt"
    ["DELETE /file/{path}: delete a Gfarm file"]="delete-source.txt"
    ["POST /symlink and GET /symlink/{path}: create and browse a symbolic link"]="symlink-target/target-file.txt"
    ["GET /attr/{path}: show Gfarm file details"]="detail-source.txt"
    ["GET and PUT /attr/{path}: change Gfarm file permissions"]="permission-source.txt"
    ["GET and PUT /acl/{path}, GET /users, GET /groups: read and update an ACL"]="acl-source.txt"
    ["POST /gfptar: create a Gfarm archive"]="archive-one.txt archive-two.txt"
)

usage() {
    cat <<EOF
Usage:
  $0
  $0 --list-webui-cases
  $0 --clean-cache
  GFARM_HTTP_WEBUI_CASE='exact Playwright test title' $0 --webui-case
EOF
}

case "${1:-}" in
    "")
        if (( $# != 0 )); then
            usage >&2
            exit 2
        fi
        ;;
    --list-webui-cases)
        if (( $# != 1 )); then
            usage >&2
            exit 2
        fi
        mode=list-webui-cases
        ;;
    --clean-cache)
        if (( $# != 1 )); then
            usage >&2
            exit 2
        fi
        mode=clean-cache
        ;;
    --webui-case)
        if (( $# != 1 )) || [[ -z "${webui_case}" ]]; then
            usage >&2
            exit 2
        fi
        mode=webui-case
        ;;
    *)
        usage >&2
        exit 2
        ;;
esac

# Each test works under its own directory, gfarm_test_root/<test function name>.
# gfarm_test_root has a random name for every run and is removed on exit.
gfarm_test_root=
gfarm_test_root_created=false
cli_uploaded_file="from-client.txt"
web_uploaded_file=$(basename "${host_fixture}")
container_workdir=
container_workdir_created=false
container_source_dir="${container_workdir}/client"
container_source="${container_workdir}/${cli_uploaded_file}"
container_download="${container_workdir}/${web_uploaded_file}"
container_gfarm_http="${container_source_dir}/gfarm-http"
gfarm_test_directory="${gfarm_test_root}/webui"
gfarm_login_upload_directory="${gfarm_test_root}/webui-login-upload"
playwright_passphrase_file="/run/gfarm-test-secrets/jwt-passphrase"
host_download=
host_secret_dir=
host_passphrase_file=
host_react_app_copy_root=
host_react_app_copy=

results=()
failed_count=0

docker_dist_exec() {
    local -a docker_options=(--user "${docker_dist_user}")

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -i|--interactive)
                docker_options+=("$1")
                shift
                ;;
            --env|--workdir)
                docker_options+=("$1" "$2")
                shift 2
                ;;
            *)
                break
                ;;
        esac
    done

    docker exec "${docker_options[@]}" "${docker_dist_client}" "$@"
}

client() {
    docker_dist_exec --env "GFARM_HTTP_URL=${gateway_url}" \
        "${container_gfarm_http}" "$@"
}

cleanup() {
    if [[ "${gfarm_test_root_created}" == true ]]; then
        client rm -r -f "${gfarm_test_root}" >/dev/null 2>&1 || true
    fi
    if [[ "${container_workdir_created}" == true ]]; then
        docker exec "${docker_dist_client}" \
            rm -rf "${container_workdir}" >/dev/null 2>&1 || true
    fi
    if [[ -n "${host_download}" ]]; then
        rm -f "${host_download}"
    fi
    if [[ -n "${host_secret_dir}" ]]; then
        rm -rf "${host_secret_dir}"
    fi
    if [[ -n "${host_react_app_copy_root}" ]]; then
        rm -rf "${host_react_app_copy_root}"
    fi
}
trap cleanup EXIT

initialize_host_temp_paths() {
    host_download=$(mktemp)
    host_secret_dir=$(mktemp -d)
    host_passphrase_file="${host_secret_dir}/jwt-passphrase"
    host_react_app_copy_root=$(mktemp -d)
    host_react_app_copy="${host_react_app_copy_root}/react-app"
    touch "${host_passphrase_file}"
    chmod 0600 "${host_passphrase_file}"
}

require_test_environment() {
    if [[ -z "${test_password}" ]]; then
        echo "Set GFARM_HTTP_TEST_PASSWORD to the docker/dist Keycloak test" \
            "user's password." >&2
        exit 2
    fi
    # Pass the password to containers by name (--env NAME) so its value never
    # appears in argv.
    export GFARM_HTTP_TEST_PASSWORD="${test_password}"

    if ! docker inspect --format '{{.State.Running}}' \
        "${docker_dist_client}" | grep -qx true; then
        echo "docker/dist client container is not running:" \
            "${docker_dist_client}" >&2
        exit 2
    fi
}

initialize_test_paths() {
    local random_suffix

    random_suffix=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
    gfarm_test_root="/tmp/gfarm-http-gateway-test-${random_suffix}"
    gfarm_test_directory="${gfarm_test_root}/webui"
    gfarm_login_upload_directory="${gfarm_test_root}/webui-login-upload"
    container_workdir="/tmp/gfarm-http-gateway-test-client-${random_suffix}"
    container_source_dir="${container_workdir}/client"
    container_source="${container_workdir}/${cli_uploaded_file}"
    container_download="${container_workdir}/${web_uploaded_file}"
    container_gfarm_http="${container_source_dir}/gfarm-http"
}

# ---- Preparation: not tests; a failure here stops the run ----------------

prepare_gfarm_http() {
    local build_cmd

    echo "[PREP] ${docker_dist_client} container: copy client sources from the" \
        "mounted checkout and build gfarm-http..."
    docker_dist_exec mkdir -p "${container_source_dir}"
    container_workdir_created=true
    docker_dist_exec cp -a "${container_checkout_client}/." "${container_source_dir}/"
    # The client test script resolves ../gfarm-http from client/test; build
    # here so it cannot pick up a stale ignored binary from the container.
    build_cmd="cd '${container_source_dir}' &&"
    build_cmd+=" go build -o '${container_gfarm_http}' ./cmd/gfarm-http"
    docker_dist_exec sh -c "${build_cmd}"
}

prepare_playwright_image() {
    if docker image inspect "${test_image}" >/dev/null 2>&1; then
        echo "[PREP] Docker host: Playwright image ${test_image} is available."
    else
        echo "[PREP] Docker host: pulling Playwright image ${test_image}..."
        docker pull "${test_image}"
    fi
}

# Copies the current react-app sources to a host temporary directory. Its
# node_modules are cached separately under the current user's cache directory.
# The client container has no Node.js, so npm ci runs inside the Playwright image.
prepare_react_app_copy() {
    local dependency_hash image_id cache_key

    if [[ "${playwright_cache_home}" != /* ]]; then
        echo "GFARM_HTTP_PLAYWRIGHT_CACHE_HOME must be an absolute path." >&2
        exit 2
    fi

    echo "[PREP] Docker host: copy the current React app sources to a temporary" \
        "test directory..."
    mkdir -p "${host_react_app_copy}"
    tar -C "${react_app_dir}" --exclude=./node_modules -cf - . |
        tar -C "${host_react_app_copy}" -xf -
    mkdir -p "${host_react_app_copy}/node_modules"

    mkdir -p "${playwright_cache_dir}"
    chmod 0700 "${playwright_cache_dir}"
    image_id=$(docker image inspect --format '{{.Id}}' "${test_image}")
    dependency_hash=$(
        sha256sum "${react_app_dir}/package.json" \
            "${react_app_dir}/package-lock.json" |
            awk '{print $1}' |
            sha256sum |
            awk '{print $1}'
    )
    cache_key=$(printf '%s\n%s\n%s\n' \
        "${test_image}" "${image_id}" "${dependency_hash}" |
        sha256sum | awk '{print $1}')
    playwright_install_app="${playwright_cache_dir}/${cache_key}/install-app"
    playwright_node_modules_cache="${playwright_install_app}/node_modules"

    if [[ -f "${playwright_install_app}/.cache-ready" &&
        -x "${playwright_node_modules_cache}/.bin/playwright" ]]; then
        echo "[PREP] Playwright container: reuse node_modules from the" \
            "Docker-host cache at" \
            "${playwright_node_modules_cache}."
        return
    fi

    echo "[PREP] Playwright container: run npm ci for React dependencies and" \
        "store node_modules in the Docker-host cache at" \
        "${playwright_node_modules_cache}..."
    mkdir -p "${playwright_install_app}"
    tar -C "${react_app_dir}" --exclude=./node_modules -cf - . |
        tar -C "${playwright_install_app}" -xf -
    docker run --rm --init \
        --user "$(id -u):$(id -g)" \
        --env HOME=/tmp \
        --env npm_config_cache=/tmp/npm-cache \
        --volume "${playwright_install_app}:/app" \
        --workdir /app \
        "${test_image}" \
        npm ci --no-audit --no-fund
    touch "${playwright_install_app}/.cache-ready"
}

# Gets a fresh JWT passphrase from the JWT Server login page. Playwright is
# only the tool that drives the login page here; the passphrase is written
# to a file for the CLI.
prepare_jwt_passphrase() {
    echo "[PREP] Playwright container: log in to JWT Server; save the CLI" \
        "passphrase to a Docker-host temporary file..."
    docker run --rm --init --ipc=host \
        --network "${docker_dist_network}" \
        --volume "${host_react_app_copy}:${playwright_container_app_dir}:ro" \
        --volume "${playwright_node_modules_cache}:${playwright_container_app_dir}/node_modules:ro" \
        --volume "${host_secret_dir}:/run/gfarm-test-secrets:rw" \
        --workdir "${playwright_container_app_dir}" \
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
    echo "[PREP] ${docker_dist_client} container: stop jwt-agent..."
    # Ignore the exit status: no running jwt-agent must not fail the run.
    # (Not verified against every agent state.)
    docker_dist_exec jwt-agent --stop >/dev/null 2>&1 || true

    echo "[PREP] ${docker_dist_client} container: start jwt-agent with the" \
        "generated passphrase..."
    docker_dist_exec -i jwt-agent -s "${jwt_server_url}" -l "${test_username}" \
        <"${host_passphrase_file}" >/dev/null
    rm -f "${host_passphrase_file}"
}

prepare_cli_credential_if_needed() {
    if client whoami >/dev/null 2>&1; then
        echo "[PREP] ${docker_dist_client} container: reuse active jwt-agent credential."
    else
        echo "[PREP] ${docker_dist_client} container: gfarm-http credential check" \
            "failed; refresh it via JWT Server."
        prepare_jwt_passphrase
        prepare_cli_credential
    fi
}

prepare_gfarm_oauth() {
    echo "[PREP] ${docker_dist_client} container: map ${docker_dist_user} to" \
        "SASL user ${test_username} and enable XOAUTH2..."
    docker_dist_exec --workdir "${docker_dist_workdir}" \
        sh ./edconf.sh sharedsecret >/dev/null
    docker_dist_exec gfuser -A "${docker_dist_user}" SASL "${test_username}"
    docker_dist_exec --workdir "${docker_dist_workdir}" \
        sh ./edconf.sh oauth2 >/dev/null
}

prepare_test_root() {
    echo "[PREP] Gfarm: create shared temporary directory /tmp if needed..."
    docker_dist_exec gfmkdir -p /tmp
    docker_dist_exec gfchmod 1777 /tmp || :
    echo "[PREP] Gfarm: create test directory ${gfarm_test_root} via gfarm-http" \
        "in ${docker_dist_client}..."
    client mkdir "${gfarm_test_root}"
    gfarm_test_root_created=true
}

escape_grep_literal() {
    local input=$1 output='' char index

    for ((index = 0; index < ${#input}; index++)); do
        char=${input:index:1}
        case "${char}" in
            \\|.|\*|+|\?|\(|\)|\[|\]|\{|\}|^|\$|\|)
                output+="\\${char}"
                ;;
            *)
                output+="${char}"
                ;;
        esac
    done
    printf '%s' "${output}"
}

run_webui_cases() {
    local list_only=$1 grep_pattern=${2:-}
    local test_directory=${3:-${gfarm_test_directory}}
    local -a docker_args=(run --rm --init)
    local -a playwright_args=(
        --config=playwright.docker-dist.webui.config.js
        --output=/tmp/gfarm-http-gateway-webui-results
    )

    if [[ "${list_only}" == true ]]; then
        playwright_args+=(--list)
    else
        docker_args+=(--ipc=host --network "${docker_dist_network}")
        docker_args+=(--env GFARM_HTTP_TEST_PASSWORD)
    fi
    if [[ -n "${grep_pattern}" ]]; then
        playwright_args+=(--grep "${grep_pattern}")
    fi

    docker "${docker_args[@]}" \
        --volume "${host_react_app_copy}:${playwright_container_app_dir}:ro" \
        --volume "${playwright_node_modules_cache}:${playwright_container_app_dir}/node_modules:ro" \
        --workdir "${playwright_container_app_dir}" \
        --env "GFARM_HTTP_GATEWAY_URL=${gateway_url}" \
        --env "GFARM_HTTP_TEST_USERNAME=${test_username}" \
        --env "GFARM_HTTP_TEST_DIRECTORY=${test_directory}" \
        --env "GFARM_HTTP_TEST_UPLOAD_FILE=${playwright_fixture}" \
        --env "GFARM_HTTP_CLIENT_UPLOADED_FILENAME=${cli_uploaded_file}" \
        --env "GFARM_HTTP_WEB_UPLOADED_FILENAME=${web_uploaded_file}" \
        "${test_image}" \
        ./node_modules/.bin/playwright test "${playwright_args[@]}"
}

webui_case_listing() {
    echo "Playwright test titles (copy one exactly to GFARM_HTTP_WEBUI_CASE):"
    printf '  %s\n' "${!webui_case_fixture_paths[@]}" | LC_ALL=C sort
}

clean_playwright_cache() {
    if [[ "${playwright_cache_home}" != /* ||
        "${playwright_cache_home}" == "/" ||
        "${playwright_cache_home}" == "." ]]; then
        echo "Refusing to remove cache under unsafe cache home: ${playwright_cache_home}" >&2
        return 2
    fi

    echo "[CLEAN] Docker host: remove Playwright dependency cache at" \
        "${playwright_cache_dir}..."
    rm -rf -- "${playwright_cache_dir}"
}

select_webui_case() {
    local grep_pattern=$1 listing selected_count selected_title

    if ! listing=$(run_webui_cases true "${grep_pattern}" 2>&1); then
        printf '%s\n' "${listing}" >&2
        return 1
    fi
    printf '%s\n' "${listing}"
    selected_count=$(sed -nE 's/^Total: ([0-9]+) tests?.*/\1/p' <<<"${listing}" | tail -n 1)
    if [[ "${selected_count}" != 1 ]]; then
        echo "The case title must select exactly one Playwright test (selected: ${selected_count:-unknown})." >&2
        echo "Run 'make list-webui-cases' to see the available titles." >&2
        return 2
    fi
    selected_title=$(sed -nE '/docker-dist\.(integration|operations)\.spec\.js:/s/^.* › //p' <<<"${listing}")
    if [[ "${selected_title}" != "${webui_case}" ]]; then
        echo "Use the exact Playwright title (selected: ${selected_title})." >&2
        return 2
    fi

    if grep -Fq 'docker-dist.integration.spec.js' <<<"${listing}"; then
        selected_webui_kind=integration
    else
        selected_webui_kind=operations
    fi
}

seed_webui_operations() {
    local case_title=$1
    local -A fixture_paths=()
    local -a case_paths=()
    local title fixture copied_fixture=false

    if [[ "${case_title}" == all ]]; then
        for title in "${!webui_case_fixture_paths[@]}"; do
            read -r -a case_paths <<<"${webui_case_fixture_paths["${title}"]}"
            for fixture in "${case_paths[@]}"; do
                fixture_paths["${fixture}"]=true
            done
        done
    elif [[ -v "webui_case_fixture_paths[${case_title}]" ]]; then
        read -r -a case_paths <<<"${webui_case_fixture_paths["${case_title}"]}"
        for fixture in "${case_paths[@]}"; do
            fixture_paths["${fixture}"]=true
        done
    else
        echo "No fixture setup is defined for Playwright case: ${case_title}" >&2
        return 2
    fi

    if [[ "${case_title}" == all ]]; then
        echo "[PREP] Gfarm: create all Web UI fixtures via gfarm-http in" \
            "${docker_dist_client}..."
    else
        echo "[PREP] Gfarm: create this Web UI case's fixtures via gfarm-http" \
            "in ${docker_dist_client}..."
    fi
    client mkdir -p "${gfarm_test_directory}"
    for fixture in "${!fixture_paths[@]}"; do
        if [[ "${fixture}" == */ ]]; then
            client mkdir -p "${gfarm_test_directory}/${fixture%/}"
        fi
    done
    for fixture in "${!fixture_paths[@]}"; do
        [[ "${fixture}" == */ ]] && continue
        if [[ "${fixture}" == */* ]]; then
            client mkdir -p "${gfarm_test_directory}/${fixture%/*}"
        fi
        if [[ "${copied_fixture}" == false ]]; then
            docker cp "${host_fixture}" "${docker_dist_client}:${container_source}"
            copied_fixture=true
        fi
        client upload "${container_source}" "${gfarm_test_directory}/${fixture}"
    done
}

seed_webui_login_upload() {
    echo "[PREP] Gfarm: upload CLI fixture from ${docker_dist_client} to" \
        "${gfarm_login_upload_directory}..."
    docker cp "${host_fixture}" "${docker_dist_client}:${container_source}"
    client mkdir "${gfarm_login_upload_directory}"
    client upload "${container_source}" \
        "${gfarm_login_upload_directory}/${cli_uploaded_file}"
}

verify_webui_upload() {
    echo "  - Gfarm -> ${docker_dist_client} container -> Docker host: download" \
        "Web UI upload with gfarm-http and compare with local fixture..."
    client download \
        "${gfarm_login_upload_directory}/${web_uploaded_file}" \
        "${container_download}"
    docker cp "${docker_dist_client}:${container_download}" "${host_download}"
    cmp "${host_fixture}" "${host_download}"
}

run_selected_webui_case() {
    local case_grep

    prepare_playwright_image
    prepare_react_app_copy
    case_grep=$(escape_grep_literal "${webui_case}")
    select_webui_case "${case_grep}"

    prepare_gfarm_http
    prepare_cli_credential_if_needed
    prepare_gfarm_oauth
    prepare_test_root

    if [[ "${selected_webui_kind}" == integration ]]; then
        seed_webui_login_upload
        run_webui_cases false "${case_grep}" "${gfarm_login_upload_directory}"
        verify_webui_upload
    else
        seed_webui_operations "${webui_case}"
        run_webui_cases false "${case_grep}"
    fi
}

# ---- Tests: each one depends only on the preparation, not on other tests --

# [CLI] Run the client's own real-Gfarm suite. It reports each operation
# separately and cleans up its unique test directory.
test_cli_operations() {
    echo "  - ${docker_dist_client} container: run client/test/gfarm-http-test.sh..."
    docker_dist_exec --env "GFARM_HTTP_URL=${gateway_url}" \
        sh -c "cd '${container_source_dir}' && ./test/gfarm-http-test.sh /tmp"
}

# [Web UI] Keycloak login, a file uploaded by the CLI is listed, and a Web UI
# upload is downloaded by the CLI and compared with the fixture. The CLI
# upload is preparation for the check.
test_webui_login_and_upload() {
    local gfarm_dir="${gfarm_test_root}/${FUNCNAME[0]}"

    echo "  - Gfarm: upload CLI fixture from ${docker_dist_client} to" \
        "${gfarm_dir}..."
    docker cp "${host_fixture}" "${docker_dist_client}:${container_source}"
    client mkdir "${gfarm_dir}"
    client upload "${container_source}" "${gfarm_dir}/${cli_uploaded_file}"

    echo "  - Playwright container: log in to Web UI, check the CLI file, and" \
        "upload a file via docker/dist Gateway..."
    docker run --rm --init --ipc=host \
        --network "${docker_dist_network}" \
        --volume "${host_react_app_copy}:${playwright_container_app_dir}:ro" \
        --volume "${playwright_node_modules_cache}:${playwright_container_app_dir}/node_modules:ro" \
        --workdir "${playwright_container_app_dir}" \
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

    echo "  - Gfarm -> ${docker_dist_client} container -> Docker host: download" \
        "Web UI upload with gfarm-http and compare with local fixture..."
    client download "${gfarm_dir}/${web_uploaded_file}" "${container_download}"
    docker cp "${docker_dist_client}:${container_download}" "${host_download}"
    cmp "${host_fixture}" "${host_download}"
}

# [Web UI] Exercise the main file operations against real Gfarm through the
# browser. Fixtures are created by gfarm-http and removed with gfarm_test_root.
test_webui_operations() {
    seed_webui_operations all

    echo "  - Playwright container: run Web UI cases against the real" \
        "docker/dist Gateway and Gfarm..."
    docker run --rm --init --ipc=host \
        --network "${docker_dist_network}" \
        --volume "${host_react_app_copy}:${playwright_container_app_dir}:ro" \
        --volume "${playwright_node_modules_cache}:${playwright_container_app_dir}/node_modules:ro" \
        --workdir "${playwright_container_app_dir}" \
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

    require_test_environment
    initialize_host_temp_paths
    initialize_test_paths
    prepare_gfarm_http
    prepare_playwright_image
    prepare_react_app_copy
    prepare_jwt_passphrase
    prepare_cli_credential
    prepare_gfarm_oauth
    prepare_test_root

    # The tests are independent: every test runs, even if an earlier one failed.
    for i in "${!fns[@]}"; do
        run_test $((i + 1)) "${total}" "${names[$i]}" "${fns[$i]}"
    done

    print_summary
}

case "${mode}" in
    list-webui-cases)
        webui_case_listing
        ;;
    clean-cache)
        clean_playwright_cache
        ;;
    webui-case)
        require_test_environment
        initialize_host_temp_paths
        initialize_test_paths
        run_selected_webui_case
        ;;
    all)
        main
        ;;
esac
