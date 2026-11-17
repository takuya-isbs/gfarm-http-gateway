#!/bin/bash
set -eu

# Get the directory containing this script
parent=$(realpath $(dirname "$0"))
# Path to gfarm-http binary
gfarm_http="${parent}/../gfarm-http"

# Check if gfarm-http exists
if [ ! -x "$gfarm_http" ]; then
    echo "Error: gfarm-http binary not found at $gfarm_http"
    echo "Please build it first: cd client && go build -o cmd/gfarm-http/gfarm-http ./cmd/gfarm-http"
    exit 1
fi

help() {
    cat <<EOF
Usage: $0 [options] Gfarm-existing-dir

Options:
  -k, --insecure    Skip TLS certificate verification
  -v, --verbose     Enable verbose output
  -h, --help        Show this help message

Environment variables:
  GFARM_HTTP_URL           Base URL for gfarm-http-gateway (required)
  GFARM_SASL_USER         SASL username (optional)
  GFARM_SASL_PASSWORD     SASL password (optional)

Example:
  export GFARM_HTTP_URL=http://localhost:8000
  $0 /tmp
EOF
}

# Parse command line options
opt_insecure=0
opt_verbose=0
opt_help=0
if [ "${GFARM_HTTP_TEST_INSECURE:-false}" = true ]; then
    opt_insecure=1
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        -k|--insecure)
            opt_insecure=1
            shift
            ;;
        -v|--verbose)
            opt_verbose=1
            shift
            ;;
        -h|--help)
            opt_help=1
            shift
            ;;
        -*)
            echo "Unknown option: $1"
            help
            exit 1
            ;;
        *)
            break
            ;;
    esac
done

if [ $opt_help -eq 1 ]; then
    help
    exit 0
fi

if [ $# -ne 1 ]; then
    help
    exit 1
fi

# Check required environment variable
if [ -z "${GFARM_HTTP_URL:-}" ]; then
    echo "Error: GFARM_HTTP_URL environment variable is required"
    echo "Example: export GFARM_HTTP_URL=http://localhost:8000"
    exit 1
fi

# Build gfarm-http options
opts=()
if [ $opt_insecure -eq 1 ]; then
    opts+=("-k")
fi
if [ $opt_verbose -eq 1 ]; then
    opts+=("-v")
fi

test_api_route() {
    case "$1" in
        test_whoami) echo "GET /conf/me" ;;
        test_mkdir) echo "PUT /dir/{path}" ;;
        test_rmdir) echo "DELETE /dir/{path}" ;;
        test_ls|test_ls_a|test_ls_e|test_ls_l|test_ls_R|test_ls_j)
            echo "GET /dir/{path}"
            ;;
        test_upload_download) echo "PUT/GET /file/{path}" ;;
        test_zip_download) echo "POST /zip" ;;
        test_chmod_stat) echo "GET/PUT /attr/{path}" ;;
        test_getfacl_setfacl) echo "GET/PUT /acl/{path}" ;;
        test_mv) echo "POST /move" ;;
        test_copy) echo "PUT /copy" ;;
        test_ln) echo "POST /symlink, GET /attr/{path}" ;;
        test_userinfo) echo "GET /user_info" ;;
        test_tar_create_and_extract) echo "POST /gfptar" ;;
        test_rm) echo "DELETE /file/{path}" ;;
        test_gfuser) echo "GET /users" ;;
        test_gfgroup) echo "GET /groups" ;;
        *) return 1 ;;
    esac
}

testname() {
    local test_case=${FUNCNAME[1]}
    local api_route
    api_route=$(test_api_route "$test_case")
    echo -n "${test_case} [${api_route}] ... "
}

PASS() {
    echo "PASS"
}

# URL encode path (simple version for basic paths)
urlpathencode() {
    echo "$1" | sed 's/ /%20/g'
}

gf_test_base_dir=$(urlpathencode "$1")
rand_suffix=$(date +%s%N | sha1sum | cut -c1-8)
testdir="${gf_test_base_dir}/$(basename "$(mktemp -u gfarm-http-test-XXXXXX)")"
testfile="${testdir}/testfile.txt"

# Helper function to run gfarm-http commands
run_gfarm_http() {
    if [ $opt_verbose -eq 1 ]; then
        "$gfarm_http" "${opts[@]}" "$@"
    else
        "$gfarm_http" "${opts[@]}" "$@" 2>/dev/null
    fi
}

test_whoami() {
    set -eu
    testname
    run_gfarm_http whoami > /dev/null
    PASS
}

test_mkdir() {
    set -eu
    testname
    run_gfarm_http mkdir "$testdir" > /dev/null
    PASS
}

test_rmdir() {
    set -eu
    testname
    run_gfarm_http rmdir "$testdir" > /dev/null
    PASS
}

test_ls() {
    set -eu
    testname
    run_gfarm_http ls "$testdir" > /dev/null
    PASS
}

test_ls_a() {
    set -eu
    testname
    run_gfarm_http ls -a "$testdir" > /dev/null
    PASS
}

test_ls_e() {
    set -eu
    testname
    run_gfarm_http ls -e "$testdir" > /dev/null
    PASS
}

test_ls_l() {
    set -eu
    testname
    run_gfarm_http ls -l "$testdir" > /dev/null
    PASS
}

test_ls_R() {
    set -eu
    testname
    run_gfarm_http ls -R "$testdir" > /dev/null
    PASS
}

test_ls_j() {
    set -eu
    testname
    run_gfarm_http ls -j "$testdir" > /dev/null
    PASS
}

test_upload_download() {
    set -eu
    testname
    data1=$(date)
    temp_file=$(mktemp)
    echo "$data1" > "$temp_file"
    
    # Upload file
    run_gfarm_http upload "$temp_file" "$testfile" > /dev/null
    
    # Download file
    temp_dl=$(mktemp)
    run_gfarm_http download "$testfile" "$temp_dl" > /dev/null
    data2=$(cat "$temp_dl")
    
    # Cleanup temp files
    rm -f "$temp_file" "$temp_dl"
    
    [ "$data1" = "$data2" ]
    PASS
}

test_zip_download() {
    set -eu
    testname
    data1=$(date)
    temp_file=$(mktemp)
    echo "$data1" > "$temp_file"
    
    # Upload file
    run_gfarm_http upload "$temp_file" "$testfile" > /dev/null

    # Download zip
    zip_file="$(mktemp)"
    run_gfarm_http zipdownload -o "$zip_file" "$testdir" > /dev/null

    extract_dir="$(mktemp -d)"

    unzip -qq -o "$zip_file" -d "$extract_dir"

    # find the extracted entry
    b1="$(basename "$testfile")"
    f1="$(find "$extract_dir" -type f -name "$b1" -print -quit || true)"
    if [[ -z "${f1:-}" ]]; then
        echo "missing expected entry in zip: $b1" >&2
        return 1
    fi

    diff -q "$temp_file" "$f1" >/dev/null

    rm -f "$temp_file" "$zip_file"
    rm -rf "$extract_dir"

    PASS
}

test_chmod_stat() {
    set -eu
    testname
    mode1="0751"
    run_gfarm_http chmod "$mode1" "$testfile" > /dev/null
    
    # Get file mode using stat with JSON output
    stat_output=$(run_gfarm_http stat "$testfile")
    mode2=$(echo "$stat_output" | jq -r '.Mode // empty' 2>/dev/null || echo "")
    
    # If JSON parsing fails, try to extract mode from plain text output
    if [ -z "$mode2" ]; then
        # For plain text output, try to find Mode line
        mode2=$(echo "$stat_output" | grep -i "^Mode:" | awk '{print $2}' || echo "")
    fi

    if [ -z "$mode2" ] || [ "$mode1" != "$mode2" ]; then
        echo "Expected file mode $mode1, got ${mode2:-empty}" >&2
        return 1
    fi

    # Test directory chmod as well
    mode3="1700"
    run_gfarm_http chmod "$mode3" "$testdir" > /dev/null

    stat_output=$(run_gfarm_http stat "$testdir")
    mode4=$(echo "$stat_output" | jq -r '.Mode // empty' 2>/dev/null || echo "")

    if [ -z "$mode4" ]; then
        mode4=$(echo "$stat_output" | grep -i "^Mode:" | awk '{print $2}' || echo "")
    fi

    if [ -z "$mode4" ] || [ "$mode3" != "$mode4" ]; then
        echo "Expected directory mode $mode3, got ${mode4:-empty}" >&2
        return 1
    fi
    PASS
}

test_getfacl_setfacl() {
    set -eu
    testname
    acl_file=$(mktemp)
    acl_output=$(mktemp)
    cleanup_acl_files() {
        rm -f "$acl_file" "$acl_output"
    }
    trap cleanup_acl_files EXIT
    printf 'user:gfarmadm:r--\n' > "$acl_file"

    run_gfarm_http setfacl -M "$acl_file" "$testfile" > /dev/null
    run_gfarm_http getfacl "$testfile" > "$acl_output"
    jq -e '.acl[] | select(.acl_type == "user" and .acl_name == "gfarmadm" and .acl_perms.r == true)' \
        "$acl_output" > /dev/null

    cleanup_acl_files
    trap - EXIT
    PASS
}

test_mv() {
    set -eu
    testname
    testfile2="${testdir}/testfile2.txt"
    
    # Move the file
    run_gfarm_http mv "$testfile" "$testfile2" > /dev/null
    
    # Verify the file exists at new location
    run_gfarm_http stat "$testfile2" > /dev/null
    
    # Move it back for cleanup
    run_gfarm_http mv "$testfile2" "$testfile" > /dev/null
    PASS
}

test_copy() {
    set -eu
    testname
    testfile_copy="${testdir}/testfile_copy.txt"
    
    # Copy the file
    run_gfarm_http copy "$testfile" "$testfile_copy" > /dev/null
    
    # Verify the copy exists
    run_gfarm_http stat "$testfile_copy" > /dev/null
    
    # Clean up the copy
    run_gfarm_http rm "$testfile_copy" > /dev/null
    PASS
}

test_ln() {
    set -eu
    testname
    testfile2="${testdir}/testfile2.txt"
    
    # Move the file
    run_gfarm_http ln -s "$testfile" "$testfile2" > /dev/null
    
    # Verify the file exists at new location
    run_gfarm_http stat "$testfile2" > /dev/null
    
    # Cleanup
    run_gfarm_http rm "$testfile2" > /dev/null
    PASS
}

test_userinfo() {
    set -eu
    testname
    run_gfarm_http userinfo > /dev/null
    PASS
}

test_gfuser() {
    set -eu
    testname
    run_gfarm_http gfuser > /dev/null
    PASS
}

test_gfgroup() {
    set -eu
    testname
    run_gfarm_http gfgroup > /dev/null
    PASS
}

test_tar_create_and_extract() {
    set -eu
    testname
    
    # Create a few test files
    temp_file1=$(mktemp)
    temp_file2=$(mktemp)
    echo "test data 1" > "$temp_file1"
    echo "test data 2" > "$temp_file2"
    
    # Upload test files
    testfile1="${testdir}/testfile1.txt"
    testfile2="${testdir}/testfile2.txt"
    run_gfarm_http upload "$temp_file1" "$testfile1" > /dev/null
    run_gfarm_http upload "$temp_file2" "$testfile2" > /dev/null
    
    # Create tar archive in testdir
    tar_outdir="${testdir}/tar_out"
    run_gfarm_http tar -c "gfarm:${tar_outdir}" -C "gfarm:${testdir}" testfile1.txt testfile2.txt > /dev/null
    
    # List tar contents
    run_gfarm_http tar -t "gfarm:${tar_outdir}" > /dev/null
    
    # Extract tar
    extract_dir="${testdir}/extract_out"
    run_gfarm_http tar -x "gfarm:${extract_dir}" "gfarm:${tar_outdir}" testfile1.txt testfile2.txt > /dev/null
    
    # Verify extracted file exists
    run_gfarm_http stat "${extract_dir}/testfile1.txt" > /dev/null
    run_gfarm_http stat "${extract_dir}/testfile2.txt" > /dev/null

    # Cleanup
    rm -f "$temp_file1" "$temp_file2"
    run_gfarm_http rm -r "$tar_outdir" > /dev/null 2>&1 || :
    run_gfarm_http rm "$testfile1" > /dev/null 2>&1 || :
    run_gfarm_http rm "$testfile2" > /dev/null 2>&1 || :
    run_gfarm_http rm -r "$extract_dir" > /dev/null 2>&1 || :
    
    PASS
}

test_rm() {
    set -eu
    testname
    run_gfarm_http rm "$testfile" > /dev/null
    PASS
}

clean() {
    local status=$?
    trap - EXIT
    # Clean up test files and directories. Fall back to gfrm only when the
    # gfarm-http rm fails, so a broken rm path does not leave test data behind.
    if ! run_gfarm_http rm -rf "$testdir" > /dev/null; then
        echo "WARNING: gfarm-http rm failed; falling back to gfrm -r $testdir" >&2
        gfrm -r "$testdir" || echo "WARNING: could not remove $testdir" >&2
    fi
    if [ "$status" -ne 0 ]; then
        echo "Test suite failed; removed $testdir"
    else
        echo "Remove $testdir"
    fi
    return "$status"
}


echo "Starting gfarm-http client tests..."
echo "Test directory: $testdir"
echo ""

# testdir is unique, so cleanup is safe even if creation or a test fails.
trap clean EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

test_cases=(
    test_whoami
    test_mkdir
    test_ls
    test_ls_a
    test_ls_e
    test_ls_l
    test_ls_R
    test_ls_j
    test_upload_download
    test_zip_download
    test_chmod_stat
    test_getfacl_setfacl
    test_mv
    test_copy
    test_ln
    test_userinfo
    test_tar_create_and_extract
    test_rm
    test_rmdir
    test_gfuser
    test_gfgroup
)
results=()
failed_count=0
total=${#test_cases[@]}

for index in "${!test_cases[@]}"; do
    test_case=${test_cases[$index]}
    api_route=$(test_api_route "$test_case")
    set +e
    ( set -e; "$test_case" )
    status=$?
    set -e

    if [ "$status" -eq 0 ]; then
        results+=("PASS  $((index + 1))/$total  $api_route  $test_case")
    else
        echo "FAIL (exit status $status)"
        results+=("FAIL  $((index + 1))/$total  $api_route  $test_case")
        failed_count=$((failed_count + 1))
    fi
done

echo
echo "==== gfarm-http client test summary ===="
printf '  %s\n' "${results[@]}"
passed_count=$((total - failed_count))
echo "Result: $passed_count passed, $failed_count failed"
[ "$failed_count" -eq 0 ]
