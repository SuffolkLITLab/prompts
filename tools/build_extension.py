#!/usr/bin/env python3
"""Build a Firefox or Chrome ZIP from the shared LIT Prompting source tree."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MANIFESTS = {
    "firefox": ROOT / "manifests" / "manifest.firefox.json",
    "chrome": ROOT / "manifests" / "manifest.chrome.json",
}
EXCLUDED_TOP_LEVEL = {"manifests", "tools", "build", ".git"}


def validate_manifest(path: Path, browser: str) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("manifest_version") != 3:
        raise ValueError(f"{browser} manifest must be Manifest V3")
    if browser == "firefox":
        if "userScripts" not in data.get("optional_permissions", []):
            raise ValueError("Firefox manifest must declare userScripts as optional")
        if "scripts" not in data.get("background", {}):
            raise ValueError("Firefox manifest must use background.scripts")
    if browser == "chrome":
        if "userScripts" not in data.get("permissions", []):
            raise ValueError("Chrome manifest must declare userScripts in permissions")
        if "service_worker" not in data.get("background", {}):
            raise ValueError("Chrome manifest must use background.service_worker")
    return data


def source_files():
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT)
        if rel.parts[0] in EXCLUDED_TOP_LEVEL:
            continue
        if rel == Path("manifest.json"):
            continue
        if "__pycache__" in rel.parts or path.suffix == ".pyc":
            continue
        yield path, rel


def build(browser: str, output: Path) -> None:
    manifest_path = MANIFESTS[browser]
    validate_manifest(manifest_path, browser)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", manifest_path.read_text(encoding="utf-8"))
        for path, rel in source_files():
            zf.write(path, rel.as_posix())

    print(f"Built {browser}: {output}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("browser", choices=MANIFESTS)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or ROOT / "build" / f"lit_prompting_{args.browser}.zip"
    build(args.browser, output)


if __name__ == "__main__":
    main()
