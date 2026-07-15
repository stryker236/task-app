from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from scheduler import solve_schedule


class SchedulerHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(200, {"status": "ok"})
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/schedule":
            self._send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length") or "0")
            payload = json.loads(self.rfile.read(length) or b"{}")
            result = solve_schedule(payload)
            self._send_json(200, result)
        except Exception as exc:
            print(f"Error while handling POST: {exc}")
            self._send_json(400, {"error": str(exc)})

    def log_message(self, format: str, *args) -> None:
        return


def main() -> None:
    host = os.environ.get("SCHEDULER_HOST", "127.0.0.1")
    port = int(os.environ.get("SCHEDULER_PORT", "8000"))
    ThreadingHTTPServer((host, port), SchedulerHandler).serve_forever()


if __name__ == "__main__":
    main()
