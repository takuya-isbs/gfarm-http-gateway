#!/usr/bin/env python3
# extract_pytest_list.py
#
# Usage:
#   python3 extract_pytest_list.py <tests_root_dir>
# Example:
#   python3 extract_pytest_list.py .
#
# Scans pytest files (test_*.py), lists test functions/classes,
# and writes ../../doc/backend-pytest-list.md.

import ast
import os
import sys
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()

# Output path (fixed)
OUTDIR = Path("../../doc")
OUTFILE = OUTDIR / "api-pytest-list.md"


def is_test_file(p: Path) -> bool:
    n = p.name
    return n.endswith(".py") and n.startswith("test_")


def walk_tests(root: Path) -> Iterator[Path]:
    for dirpath, _, filenames in os.walk(root):
        for fn in sorted(filenames):
            p = Path(dirpath) / fn
            if is_test_file(p):
                yield p


def extract_from_file(path: Path) -> tuple[dict[str, list[str]], list[str]]:
    """Return (classes: dict[str, list[str]], functions: list[str])"""
    try:
        src = path.read_text(encoding="utf-8")
    except Exception:
        return {}, []
    try:
        tree = ast.parse(src, filename=str(path))
    except SyntaxError:
        return {}, []
    classes: dict[str, list[str]] = {}
    functions: list[str] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))\
                and node.name.startswith("test_"):
            functions.append(node.name)
        elif isinstance(node, ast.ClassDef) and node.name.startswith("Test"):
            class_tests = []
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))\
                        and item.name.startswith("test_"):
                    class_tests.append(item.name)
            if class_tests:
                classes[node.name] = class_tests
    return classes, functions


def main() -> None:
    ymd = datetime.now().strftime("%Y%m%d")
    lines = [f"# Backend Pytest Test List ({ymd})", ""]
    for f in sorted(walk_tests(ROOT)):
        classes, functions = extract_from_file(f)
        if not classes and not functions:
            continue
        rel = f.relative_to(ROOT)
        lines.append(f"## {rel}")
        for fn in functions:
            lines.append(f"- {fn}")
        for cls, tests in sorted(classes.items()):
            lines.append(f"- **{cls}**")
            for tn in tests:
                lines.append(f"  - {tn}")
        lines.append("")

    OUTFILE.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote: {OUTFILE}")


if __name__ == "__main__":
    if not ROOT.exists():
        print(f"Path not found: {ROOT}", file=sys.stderr)
        sys.exit(1)
    main()
