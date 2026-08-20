#!/usr/bin/env python3
"""Assert Firefox and Chrome release ZIPs differ only in manifest.json."""
from __future__ import annotations
import argparse
import hashlib
import zipfile
from pathlib import Path


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def contents(path: Path) -> dict[str, str]:
    with zipfile.ZipFile(path) as zf:
        return {
            name: digest(zf.read(name))
            for name in sorted(zf.namelist())
            if name != 'manifest.json' and not name.endswith('/')
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('firefox', type=Path)
    parser.add_argument('chrome', type=Path)
    args = parser.parse_args()

    firefox = contents(args.firefox)
    chrome = contents(args.chrome)
    if firefox.keys() != chrome.keys():
        only_firefox = sorted(firefox.keys() - chrome.keys())
        only_chrome = sorted(chrome.keys() - firefox.keys())
        raise SystemExit(f'Package file sets differ outside manifest.json. Firefox-only={only_firefox}, Chrome-only={only_chrome}')

    mismatches = [name for name in firefox if firefox[name] != chrome[name]]
    if mismatches:
        raise SystemExit('Packages differ outside manifest.json: ' + ', '.join(mismatches))

    print('PASS: Firefox and Chrome packages differ only in manifest.json')


if __name__ == '__main__':
    main()
