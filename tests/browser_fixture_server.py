"""Local-only fault fixtures for manual browser QA. Never part of the static build.

python3 tests/browser_fixture_server.py
Open /missing-data/, /bad-data/, /missing-tiles/, /slow-data/ or /empty-screen/.
The missing-data fixture fails once; Retry should recover. Empty-screen substitutes
zero modeled anomalies to exercise the no-match state; it is synthetic test data.
"""
import json
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1] / 'web'


class FixtureHandler(SimpleHTTPRequestHandler):
    failed_once = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        parts = urlsplit(self.path).path.strip('/').split('/')
        mode = parts[0]
        if mode == 'tile-failure':
            self.send_error(503, 'Intentional tile failure for QA')
            return
        modes = {'missing-data', 'bad-data', 'missing-tiles', 'slow-data', 'empty-screen'}
        if mode not in modes:
            self.send_error(404)
            return
        relative = '/'.join(parts[1:]) or 'index.html'
        if relative == 'heat/grid.json':
            if mode == 'missing-data' and not FixtureHandler.failed_once:
                FixtureHandler.failed_once = True
                self.send_error(503, 'Intentional one-time data failure for QA')
                return
            if mode == 'slow-data':
                time.sleep(8)
            if mode in {'bad-data', 'empty-screen'}:
                data = {} if mode == 'bad-data' else json.loads((ROOT / relative).read_text())
                if mode == 'empty-screen':
                    data['predicted_c'] = [[0 if v != -999 else -999 for v in row] for row in data['predicted_c']]
                self.send_bytes(json.dumps(data).encode(), 'application/json')
                return
        if mode == 'missing-tiles' and relative == 'heat.js':
            data = (ROOT / relative).read_text().replace(
                'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                'http://localhost:8766/tile-failure/{z}/{x}/{y}.png')
            self.send_bytes(data.encode(), 'text/javascript')
            return
        self.path = '/' + relative
        super().do_GET()

    def send_bytes(self, data, mime):
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    print('Local QA fixtures: http://localhost:8766/missing-data/#map-section', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8766), FixtureHandler).serve_forever()
