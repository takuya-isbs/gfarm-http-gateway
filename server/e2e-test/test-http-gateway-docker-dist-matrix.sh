#!/usr/bin/env bash
set -Eeuo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runner="${script_dir}/test-http-gateway-docker-dist.sh"
log_file=test-e2e-matrix.log
current_label=
current_started=0

trap '
    if [[ -n "${current_label}" ]]; then
        elapsed_seconds=$((SECONDS - current_started))
        printf "INTERRUPTED (%ss)\n" "${elapsed_seconds}" >&2
    fi
    exit 130
' INT
trap 'exit 143' TERM

if [[ -e "${log_file}" ]]; then
    if [[ ! -t 0 ]]; then
        echo "Refusing to overwrite ${log_file} without interactive confirmation." >&2
        exit 2
    fi
    read -r -p "Overwrite ${log_file}? [y/N] " answer
    case "${answer,,}" in
        y|yes) ;;
        *) echo "Cancelled; kept existing ${log_file}." >&2; exit 1 ;;
    esac
fi
: >"${log_file}"
printf 'Detailed test output: %s\n' "${log_file}" >&2

variants=(
    "http-gw-https (Web UI)|https://http-gw-https|true|webui-only"
    "http-gw-https (CLI)|https://http-gw-https|true|cli-only"
    "http-gw-python3-11 (CLI)|http://http-gw-python3-11:8000|false|cli-only"
    "http-gw-python3-15 (CLI)|http://http-gw-python3-15:8000|false|cli-only"
)
status=0

for variant in "${variants[@]}"; do
    IFS='|' read -r label url insecure mode <<<"${variant}"
    current_label=${label}
    current_started=$SECONDS

    printf '%s ... ' "${label}" >&2
    printf '===== %s: %s =====\n' "${label}" "${url}" >>"${log_file}"
    runner_args=()
    case "${mode}" in
        cli-only) runner_args+=(--cli-only) ;;
        webui-only) runner_args+=(--webui-only) ;;
    esac
    if GFARM_HTTP_GATEWAY_URL="${url}" GFARM_HTTP_TEST_INSECURE="${insecure}" \
        "${runner}" "${runner_args[@]}" >>"${log_file}" 2>&1; then
        result=PASS
    else
        result=FAIL
        status=1
    fi
    elapsed_seconds=$((SECONDS - current_started))
    printf '%s (%ss)\n' "${result}" "${elapsed_seconds}" >&2
    current_label=
done

exit "${status}"
