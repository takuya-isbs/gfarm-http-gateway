from copy import deepcopy
from typing import Any

from api_route_coverage import (
    analyze_coverage,
    coverage_below_baseline,
    find_openapi_operation,
)


def test_find_openapi_operation_matches_method_and_path() -> None:
    paths: dict[str, dict[str, Any]] = {
        "/conf/me": {"get": {}},
        "/dir/{gfarm_path}": {"get": {}, "put": {}},
    }

    assert find_openapi_operation("GET", "/conf/me", paths) == (
        "GET", "/conf/me")
    assert find_openapi_operation("PUT", "/dir/tmp/nested", paths) == (
        "PUT", "/dir/{gfarm_path}")


def test_find_openapi_operation_rejects_unknown_method_or_path() -> None:
    paths: dict[str, dict[str, Any]] = {"/conf/me": {"get": {}}}

    assert find_openapi_operation("POST", "/conf/me", paths) is None
    assert find_openapi_operation("GET", "/unknown", paths) is None


def test_analyze_coverage_counts_operations_parameters_and_values_per_client() -> None:
    openapi = {
        "paths": {
            "/file/{gfarm_path}": {
                "get": {
                    "parameters": [
                        {"name": "gfarm_path", "in": "path",
                         "schema": {"type": "string"}},
                        {"name": "action", "in": "query",
                         "schema": {"type": "string",
                                    "enum": ["download", "preview"]}},
                        {"name": "recursive", "in": "query",
                         "schema": {"type": "boolean"}},
                    ],
                },
            },
            "/groups": {
                "get": {
                    "parameters": [
                        {"name": "long_format", "in": "query",
                         "schema": {"type": "boolean"}},
                    ],
                },
            },
        },
    }
    requests = [
        {"client": "cli", "method": "GET", "path": "/file/a",
         "query": {"action": ["download"], "recursive": ["true"]}},
        {"client": "webui", "method": "GET", "path": "/file/b",
         "query": {"action": ["preview"], "recursive": ["false"]}},
    ]

    report = analyze_coverage(openapi, requests)

    assert report["cli"]["operations"] == {"covered": 1, "total": 2}
    assert report["cli"]["parameters"] == {"covered": 3, "total": 4}
    assert report["cli"]["values"] == {"covered": 2, "total": 6}
    assert report["webui"]["values"] == {"covered": 2, "total": 6}
    assert report["combined"]["values"] == {"covered": 4, "total": 6}


def test_coverage_below_baseline_detects_new_operation_and_flag() -> None:
    openapi: dict[str, Any] = {
        "paths": {
            "/file": {
                "get": {
                    "parameters": [
                        {"name": "recursive", "in": "query",
                         "schema": {"type": "boolean"}},
                    ],
                },
            },
        },
    }
    requests = [
        {"client": "cli", "method": "GET", "path": "/file",
         "query": {"recursive": ["true", "false"]}},
        {"client": "webui", "method": "GET", "path": "/file",
         "query": {"recursive": ["true", "false"]}},
    ]
    baseline = analyze_coverage(openapi, requests)
    expanded = deepcopy(openapi)
    expanded["paths"]["/new"] = {"get": {}}

    assert not coverage_below_baseline(baseline, baseline)
    report = analyze_coverage(expanded, requests)
    assert coverage_below_baseline(report, baseline)

    expanded = deepcopy(openapi)
    expanded["paths"]["/file"]["get"]["parameters"].append(
        {"name": "hidden", "in": "query", "schema": {"type": "boolean"}}
    )
    report = analyze_coverage(expanded, requests)
    assert coverage_below_baseline(report, baseline)


def test_analyze_coverage_counts_enum_path_parameter_values() -> None:
    openapi = {
        "paths": {
            "/mode/{mode}": {
                "get": {
                    "parameters": [
                        {"name": "mode", "in": "path",
                         "schema": {"type": "string",
                                    "enum": ["fast", "safe"]}},
                    ],
                },
            },
        },
    }
    requests = [
        {"client": "cli", "method": "GET", "path": "/mode/fast"},
    ]

    report = analyze_coverage(openapi, requests)

    assert report["cli"]["parameters"] == {"covered": 1, "total": 1}
    assert report["cli"]["values"] == {"covered": 1, "total": 2}
    assert report["cli"]["missing"]["values"] == [
        "GET /mode/{mode} mode=safe"
    ]
