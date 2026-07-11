#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERSION = (ROOT / "VERSION").read_text().strip()


def replace(path: str, pattern: str, repl: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text()
    updated = re.sub(pattern, repl, text)
    if updated != text:
        file_path.write_text(updated)


def update_json_version(path: str) -> None:
    file_path = ROOT / path
    data = json.loads(file_path.read_text())
    data["version"] = VERSION
    file_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def update_package_lock_version(path: str) -> None:
    file_path = ROOT / path
    data = json.loads(file_path.read_text())
    data["version"] = VERSION
    if isinstance(data.get("packages"), dict) and "" in data["packages"]:
        data["packages"][""]["version"] = VERSION
    file_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


update_json_version("frontend/package.json")
update_package_lock_version("frontend/package-lock.json")
replace("backend/app/version.py", r'APP_VERSION = "[^"]+"', f'APP_VERSION = "{VERSION}"')
replace("extension/manifest.json", r'("version":\s*")([^"]+)(")', rf"\g<1>{VERSION}\3")
replace("extension/options.html", r"LinkKeep Extension</strong> v[^<]+<br>", f"LinkKeep Extension</strong> v{VERSION}<br>")
replace("frontend/src/pages/Settings.jsx", r'<Row label="Version" value="[^"]+" mono />', f'<Row label="Version" value="{VERSION}" mono />')
replace("frontend/src/pages/Login.jsx", r"LinkAtlas v[0-9.]+", f"LinkAtlas v{VERSION.rsplit('.', 1)[0]}")
replace("frontend/src/components/Sidebar.jsx", r"LinkAtlas v[0-9.]+", f"LinkAtlas v{VERSION.rsplit('.', 1)[0]}")
print(f"Synced version {VERSION}")
