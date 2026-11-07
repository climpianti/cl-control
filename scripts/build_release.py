"""Build the integration-only manual-install ZIP from tracked source files."""
from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "cl_control"


def literal(path: Path, name: str):
    for statement in ast.parse(path.read_text(encoding="utf-8")).body:
        if isinstance(statement, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == name
            for target in statement.targets
        ):
            return ast.literal_eval(statement.value)
    raise ValueError(f"Missing {name} in {path.name}")


def main():
    version = json.loads((COMPONENT / "manifest.json").read_text(encoding="utf-8"))["version"]
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z]+\.[0-9]+)?", version):
        raise ValueError("Unexpected release version")
    if literal(COMPONENT / "const.py", "VERSION") != version:
        raise ValueError("Manifest and backend versions differ")
    frontend = COMPONENT / "frontend"
    required = literal(COMPONENT / "frontend.py", "REQUIRED_ASSETS")
    for name in required:
        if not (frontend / name).is_file():
            raise ValueError(f"Missing required frontend asset: {name}")
    for asset in frontend.glob("*.mjs"):
        for relative in re.findall(r"import\s+['\"]\./([^'\"]+)['\"]", asset.read_text(encoding="utf-8")):
            if not (frontend / relative).is_file():
                raise ValueError(f"Missing module imported by {asset.name}: {relative}")
    files = subprocess.check_output(
        ["git", "ls-files", "-z", "--", "custom_components/cl_control"], cwd=ROOT
    ).decode("utf-8").split("\0")
    files = sorted(name for name in files if name)
    forbidden = {".storage", "__pycache__", "node_modules", "backups"}
    for name in files:
        path = Path(name)
        if forbidden.intersection(path.parts) or path.suffix in {".pyc", ".log", ".key", ".pem"} or path.name in {"secrets.yaml", ".env"}:
            raise ValueError(f"Forbidden release file: {name}")
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    archive = output / f"cl-control-{version}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for name in files:
            # Fixed archive timestamp and permissions make repeated builds comparable.
            item = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            item.external_attr = 0o100644 << 16
            item.compress_type = zipfile.ZIP_DEFLATED
            package.writestr(item, (ROOT / name).read_bytes())
    with zipfile.ZipFile(archive) as package:
        if package.testzip() is not None:
            raise ValueError("Archive integrity check failed")
        for name in required:
            if f"custom_components/cl_control/frontend/{name}" not in package.namelist():
                raise ValueError(f"Required asset absent from archive: {name}")
        packaged_version = json.loads(package.read("custom_components/cl_control/manifest.json"))["version"]
        if packaged_version != version:
            raise ValueError("Packaged manifest version mismatch")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / "SHA256SUMS.txt").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    print(f"{archive.name}: {len(files)} files, {archive.stat().st_size} bytes")
    print(f"SHA256 {digest}")


if __name__ == "__main__":
    main()
