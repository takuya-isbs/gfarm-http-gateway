"""Helpers for comparing client requests with OpenAPI operations."""

import argparse
import json
import os
import sys
from collections.abc import Iterator
from typing import Any, cast
from urllib.parse import unquote

HTTP_METHODS = {"DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"}
CLIENTS = ("cli", "webui", "combined")


def find_openapi_operation(
    method: str, request_path: str, paths: dict[str, Any]
) -> tuple[str, str] | None:
    """Return the OpenAPI method and path matching a client request."""
    method = method.upper()
    if method not in HTTP_METHODS:
        return None

    for route, operations in paths.items():
        if method.lower() not in operations:
            continue
        route_parts = [part for part in route.strip("/").split("/") if part]
        request_parts = [
            part for part in request_path.strip("/").split("/") if part
        ]
        if len(request_parts) < len(route_parts):
            continue

        matches = True
        for index, route_part in enumerate(route_parts):
            if route_part.startswith("{") and route_part.endswith("}"):
                if index == len(route_parts) - 1:
                    break
                continue
            if route_part != request_parts[index]:
                matches = False
                break

        if matches and (
                len(request_parts) == len(route_parts)
                or (route_parts and route_parts[-1].startswith("{"))):
            return method, route

    return None


def analyze_coverage(
    openapi: dict[str, Any], requests: list[dict[str, Any]]
) -> dict[str, Any]:
    """Count OpenAPI operations, parameters, and values seen per client."""
    operations = list(_iter_operations(openapi))
    result: dict[str, Any] = {}
    for client in CLIENTS:
        operation_total = len(operations)
        operation_covered = 0
        parameter_total = 0
        parameter_covered = 0
        value_total = 0
        value_covered = 0
        missing_operations = []
        missing_parameters = []
        missing_values = []

        for method, route, parameters in operations:
            operation_name = f"{method} {route}"
            matching_requests = [
                request for request in requests
                if (client == "combined" or request.get("client") == client)
                and request.get("method", "").upper() == method
                and find_openapi_operation(
                    method,
                    request.get("path", ""),
                    {route: {method.lower(): {}}},
                ) is not None
            ]
            if matching_requests:
                operation_covered += 1
            else:
                missing_operations.append(operation_name)

            for parameter in parameters:
                location = parameter.get("in")
                name = parameter.get("name")
                if location not in ("path", "query") or not name:
                    continue
                parameter_total += 1
                if location == "path":
                    observed_values = {
                        value
                        for request in matching_requests
                        for value in _path_parameter_values(
                            route, request.get("path", "")
                        ).get(name, [])
                    }
                    present = bool(observed_values)
                else:
                    observed_values = {
                        value
                        for request in matching_requests
                        for value in _query_values(
                            request.get("query", {}), name
                        )
                    }
                    present = bool(observed_values)
                if present:
                    parameter_covered += 1
                else:
                    missing_parameters.append(
                        f"{operation_name} {location} parameter {name}"
                    )

                schema = _resolve_schema(
                    parameter.get("schema", {}), openapi.get("components", {})
                )
                expected_values = _flag_values(schema)
                if not expected_values:
                    continue
                value_total += len(expected_values)
                normalized_observed = {
                    _normalize_flag_value(value, schema)
                    for value in observed_values
                }
                for expected in expected_values:
                    normalized_expected = _normalize_flag_value(
                        expected, schema
                    )
                    if normalized_expected in normalized_observed:
                        value_covered += 1
                    else:
                        missing_values.append(
                            f"{operation_name} {name}={expected}"
                        )

        result[client] = {
            "operations": {
                "covered": operation_covered,
                "total": operation_total,
            },
            "parameters": {
                "covered": parameter_covered,
                "total": parameter_total,
            },
            "values": {"covered": value_covered, "total": value_total},
            "missing": {
                "operations": missing_operations,
                "parameters": missing_parameters,
                "values": missing_values,
            },
        }
    return result


def _iter_operations(
    openapi: dict[str, Any],
) -> Iterator[tuple[str, str, list[dict[str, Any]]]]:
    for route, path_item in openapi.get("paths", {}).items():
        path_parameters = path_item.get("parameters") or []
        for method, operation in path_item.items():
            if (method.upper() not in HTTP_METHODS
                    or not isinstance(operation, dict)):
                continue
            parameters = {
                (parameter.get("in"), parameter.get("name")): parameter
                for parameter in path_parameters + (
                    operation.get("parameters") or []
                )
            }
            yield method.upper(), route, list(parameters.values())


def _resolve_schema(schema: Any, components: dict[str, Any]) -> dict[str, Any]:
    reference = schema.get("$ref") if isinstance(schema, dict) else None
    if not reference:
        return schema if isinstance(schema, dict) else {}
    name = reference.rsplit("/", 1)[-1]
    return cast(dict[str, Any], components.get("schemas", {}).get(name, {}))


def _path_parameter_values(route: str, request_path: str) -> dict[str, list[str]]:
    route_parts = [part for part in route.strip("/").split("/") if part]
    request_parts = [
        unquote(part) for part in request_path.strip("/").split("/") if part
    ]
    values: dict[str, list[str]] = {}
    for index, route_part in enumerate(route_parts):
        if route_part.startswith("{") and route_part.endswith("}"):
            name = route_part[1:-1].split(":", 1)[0]
            parts = request_parts[index:]
            values[name] = ["/".join(parts)] if parts else []
            if index == len(route_parts) - 1:
                break
    return values


def _flag_values(schema: dict[str, Any]) -> list[str]:
    if schema.get("enum"):
        return [str(value) for value in schema["enum"]]
    if schema.get("type") == "boolean":
        return ["false", "true"]
    return []


def _normalize_flag_value(value: Any, schema: dict[str, Any]) -> str:
    if schema.get("type") == "boolean":
        value = str(value).lower()
        if value in {"1", "on", "yes", "true"}:
            return "true"
        if value in {"0", "off", "no", "false"}:
            return "false"
    return str(value)


def _query_values(query: dict[str, Any], name: str) -> list[Any]:
    value = query.get(name, [])
    if isinstance(value, list):
        return value
    return [value]


def _overall_rate(client_report: dict[str, Any]) -> float:
    sections = (client_report["operations"], client_report["parameters"],
                client_report["values"])
    total = sum(section["total"] for section in sections)
    covered = sum(section["covered"] for section in sections)
    return float(covered / total) if total else 1.0


def coverage_below_baseline(
    report: dict[str, Any], baseline: dict[str, Any]
) -> bool:
    """Return whether any client coverage rate fell below its baseline."""
    for client in CLIENTS:
        for section in ("operations", "parameters", "values"):
            current = report[client][section]
            previous = baseline[client][section]
            if _rate(current) < _rate(previous):
                return True
    return False


def _rate(section: dict[str, Any]) -> float:
    if not section["total"]:
        return 1.0
    return float(section["covered"] / section["total"])


def _print_report(report: dict[str, Any], baseline: dict[str, Any]) -> int:
    for client in CLIENTS:
        client_report = report[client]
        print(f"{client}: overall {_overall_rate(client_report):.1%}")
        labels = {
            "operations": "operations",
            "parameters": "path/query parameters",
            "values": "enum/boolean values",
        }
        for section in labels:
            counts = client_report[section]
            print(
                f"  {labels[section]}: {counts['covered']}/{counts['total']} "
                f"({_rate(counts):.1%})"
            )
            for item in client_report["missing"][section]:
                print(f"    missing: {item}")
    combined_rate = _overall_rate(report["combined"])
    below_baseline = False
    for client in CLIENTS:
        for section in ("operations", "parameters", "values"):
            current_rate = _rate(report[client][section])
            baseline_rate = _rate(baseline[client][section])
            if current_rate < baseline_rate:
                below_baseline = True
                print(
                    f"coverage below baseline: {client} {section} "
                    f"{current_rate:.1%} < {baseline_rate:.1%}",
                    file=sys.stderr,
                )
    if below_baseline:
        print(
            f"OpenAPI combined coverage: {combined_rate:.1%}",
            file=sys.stderr,
        )
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("request_log")
    parser.add_argument("--baseline", required=True)
    args = parser.parse_args()
    spec_json = os.environ.get("GFARM_HTTP_OPENAPI_JSON", "")
    if not spec_json:
        parser.error(
            "GFARM_HTTP_OPENAPI_JSON must contain the server OpenAPI document"
        )
    openapi = json.loads(spec_json)
    with open(args.request_log, encoding="utf-8") as request_file:
        requests = [json.loads(line) for line in request_file if line.strip()]
    with open(args.baseline, encoding="utf-8") as baseline_file:
        baseline = json.load(baseline_file)
    report = analyze_coverage(openapi, requests)
    return _print_report(report, baseline)


if __name__ == "__main__":
    raise SystemExit(main())
