#!/usr/bin/env python3
"""Opt-in CL Control Codespaces test bridge using GitHub Issues.

Run from the Codespace only. It accepts fixed test names from issues
opened by the repository owner. It never executes issue text as shell.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
REPO = "climpianti/cl-control"
OWNER = "climpianti"
BRANCH = "feature/codespaces-cl-control"
MARKER = "CL-CODESPACE-RUNNER/v1"
TASKS = {
    "offline": [[sys.executable, "tests/run_offline.py"]],
    "syntax": [
        [sys.executable, "-m", "compileall", "-q", "custom_components/cl_control", "tests"],
    ],
}


def gh(method: str, endpoint: str, fields: dict[str, str] | None = None):
    argv = ["gh", "api", "--method", method, endpoint]
    for key, value in (fields or {}).items():
        argv.extend(["-f", f"{key}={value}"])
    run = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True, timeout=30, check=True)
    if method == "GET":
        return json.loads(run.stdout)
    return None


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def safe_env() -> dict[str, str]:
    # Do not pass GitHub auth tokens or other secrets to test processes.
    deny = ("TOKEN", "SECRET", "PASSWORD", "PRIVATE", "CREDENTIAL", "API_KEY", "AUTH")
    return {k: v for k, v in os.environ.items() if not any(x in k.upper() for x in deny)}


def task_from(issue: dict) -> str | None:
    if "pull_request" in issue or issue.get("user", {}).get("login") != OWNER:
        return None
    body = issue.get("body") or ""
    for task in TASKS:
        expected = f"{MARKER}\ntask={task}\nbranch={BRANCH}"
        if body.strip() == expected and issue.get("title") == f"[CL Codespace] {task}":
            return task
    return None


def run_task(task: str) -> tuple[bool, str]:
    result_lines = []
    for cmd in TASKS[task]:
        print(f"Executing allowlisted task: {task}", flush=True)
        try:
            proc = subprocess.run(
                cmd, cwd=ROOT, text=True, capture_output=True,
                env=safe_env(), timeout=180, check=False,
            )
        except subprocess.TimeoutExpired:
            return False, "Task exceeded 180 seconds."
        output = (proc.stdout or "") + "\n" + (proc.stderr or "")
        # Detailed logs stay inside the Codespace: this repository is public.
        print(output[-15000:], flush=True)
        for line in output.splitlines():
            if re.fullmatch(r"Ran [0-9]+ tests in [0-9.]+s", line.strip()):
                result_lines.append(line.strip())
        if proc.returncode:
            return False, f"Test command exited with status {proc.returncode}. Inspect Codespaces terminal."
    return True, "; ".join(result_lines) or "Syntax/compilation completed."


def process_one() -> bool:
    issues = gh("GET", f"repos/{REPO}/issues?state=open&per_page=100")
    for issue in issues:
        task = task_from(issue)
        if task is None:
            continue
        number = int(issue["number"])
        sha = git("rev-parse", "--short", "HEAD")
        if git("branch", "--show-current") != BRANCH:
            ok, summary = False, "Incorrect checked-out branch. No test executed."
        else:
            ok, summary = run_task(task)
        status = "PASS" if ok else "FAIL"
        comment = (
            f"CL Codespace runner v1: **{status}**\n\n"
            f"Task: `{task}` | Branch: `{BRANCH}` | Commit: `{sha}`\n\n"
            f"{summary}\n\n"
            "No command output or secrets were uploaded; detailed logs remain in the Codespace."
        )
        gh("POST", f"repos/{REPO}/issues/{number}/comments", {"body": comment})
        gh("PATCH", f"repos/{REPO}/issues/{number}", {"state": "closed"})
        print(f"Issue #{number}: {status}", flush=True)
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watch", action="store_true", help="Poll for tasks while this terminal is open")
    args = parser.parse_args()
    if git("branch", "--show-current") != BRANCH:
        parser.error(f"Switch to {BRANCH} first")
    if not shutil.which("gh"):
        parser.error("GitHub CLI (gh) is missing. Rebuild the Codespace container after pulling .devcontainer changes.")
    status = subprocess.run(["gh", "auth", "status"], cwd=ROOT, capture_output=True, text=True, timeout=20)
    if status.returncode:
        parser.error("GitHub CLI is not authenticated. Run gh auth login interactively; do not paste credentials into chat.")
    print("CL Codespace test bridge; approved tasks: offline, syntax.", flush=True)
    print("No ports are opened. Stop with Ctrl+C.", flush=True)
    try:
        while True:
            try:
                process_one()
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError, json.JSONDecodeError) as exc:
                print(f"Bridge warning: {type(exc).__name__} (see GitHub auth/network)", flush=True)
            if not args.watch:
                break
            time.sleep(20)
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
