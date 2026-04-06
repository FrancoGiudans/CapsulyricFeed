from __future__ import annotations

import json
import subprocess
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
DATA_DIR = REPO_ROOT / "data"
HOST = "127.0.0.1"
PORT = 8000
TRACKED_FILES = [
    Path("data/announcements.json"),
    Path("data/polls.json"),
]


def run_git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        check=check,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def detect_remote() -> str:
    remotes = run_git("remote", check=False).stdout.splitlines()
    if "origin" in remotes:
        return "origin"
    return remotes[0] if remotes else "origin"


def detect_branch() -> str:
    return run_git("rev-parse", "--abbrev-ref", "HEAD", check=False).stdout.strip() or "main"


def tracked_file_args() -> list[str]:
    return [str(path).replace("\\", "/") for path in TRACKED_FILES]


class FeedHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def do_GET(self):
        if self.path == "/api/status":
            self.handle_status()
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/push":
            self.handle_push()
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Unknown API endpoint")

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_status(self):
        branch = detect_branch()
        remote = detect_remote()
        status = run_git("status", "--short", check=False).stdout
        tracked_status = run_git("status", "--short", "--", *tracked_file_args(), check=False).stdout
        self.send_json(
            {
                "branch": branch,
                "remote": remote,
                "dirty": bool(status.strip()),
                "status": status,
                "trackedStatus": tracked_status,
                "trackedFiles": tracked_file_args(),
            }
        )

    def handle_push(self):
        try:
            payload = self.read_json()
            files = payload.get("files", {})
            commit_message = str(payload.get("commitMessage", "")).strip() or "Update community feed"

            announcements = files.get("announcements")
            polls = files.get("polls")
            if announcements is None or polls is None:
                self.send_json({"error": "Missing announcements or polls payload"}, HTTPStatus.BAD_REQUEST)
                return

            DATA_DIR.mkdir(exist_ok=True)
            (DATA_DIR / "announcements.json").write_text(
                json.dumps(announcements, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            (DATA_DIR / "polls.json").write_text(
                json.dumps(polls, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

            output_parts = []
            tracked_files = tracked_file_args()
            run_git("add", "--", *tracked_files)

            diff = subprocess.run(
                ["git", "diff", "--cached", "--quiet", "--", *tracked_files],
                cwd=REPO_ROOT,
                check=False,
            )
            if diff.returncode == 0:
                self.send_json(
                    {
                        "branch": detect_branch(),
                        "remote": detect_remote(),
                        "output": "No JSON changes to commit.",
                        "trackedFiles": tracked_files,
                    }
                )
                return

            commit_proc = run_git("commit", "-m", commit_message, "--", *tracked_files, check=False)
            output_parts.append(commit_proc.stdout)
            output_parts.append(commit_proc.stderr)
            if commit_proc.returncode != 0:
                self.send_json({"error": "".join(output_parts).strip() or "git commit failed"}, HTTPStatus.BAD_REQUEST)
                return

            branch = detect_branch()
            remote = detect_remote()
            push_proc = run_git("push", remote, branch, check=False)
            output_parts.append(push_proc.stdout)
            output_parts.append(push_proc.stderr)
            if push_proc.returncode != 0:
                self.send_json(
                    {
                        "error": "".join(output_parts).strip() or "git push failed",
                        "branch": branch,
                        "remote": remote,
                    },
                    HTTPStatus.BAD_REQUEST,
                )
                return

            self.send_json(
                {
                    "branch": branch,
                    "remote": remote,
                    "trackedFiles": tracked_files,
                    "output": "\n".join(part.strip() for part in output_parts if part and part.strip()),
                }
            )
        except Exception as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), FeedHandler)
    print(f"Serving Caps Feed at http://{HOST}:{PORT}")
    server.serve_forever()
