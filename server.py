#!/usr/bin/env python3
"""Loopback-only static app and atomic local progress storage."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit
import json
import math
import os
import tempfile

ROOT = Path(__file__).resolve().parent
STATE = ROOT / '.progress' / 'progress.json'
LOCK = Lock()
PORT = int(os.environ.get('MOCK_TEST_PORT', '17654'))


def timestamp(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError('Invalid timestamp')
    return value


def merge_state(existing, incoming):
    deleted, attempts = {}, {}
    for state in (existing, incoming):
        if not isinstance(state, dict) or state.get('version') != 1 or not isinstance(state.get('attempts'), list):
            raise ValueError('Invalid state')
        timestamp(state.get('updated', 0))
        removals = state.get('deleted', {})
        if not isinstance(removals, dict):
            raise ValueError('Invalid deletions')
        for identity, time in removals.items():
            if not isinstance(identity, str) or not identity:
                raise ValueError('Invalid attempt ID')
            deleted[identity] = max(deleted.get(identity, 0), timestamp(time))
        for attempt in state['attempts']:
            if not isinstance(attempt, dict) or not isinstance(attempt.get('id'), str) or not attempt['id']:
                raise ValueError('Invalid attempt')
            identity = attempt['id']
            time = timestamp(attempt.get('updated', state.get('updated', attempt.get('created', 0))))
            old = attempts.get(identity)
            if old is None or time >= old['updated']:
                attempts[identity] = dict(attempt, updated=time)
    # IDs are never reused: a cleared attempt cannot be resurrected by an old tab.
    return {
        'version': 1,
        'updated': max(existing.get('updated', 0), incoming.get('updated', 0)),
        'deleted': deleted,
        'attempts': sorted((a for identity, a in attempts.items() if identity not in deleted), key=lambda a: a.get('created', 0)),
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store' if self.path.startswith('/api/') else 'no-cache')
        super().end_headers()

    def send_json(self, value, status=200):
        payload = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def valid_host(self):
        return self.headers.get('Host') in [f'127.0.0.1:{PORT}', f'localhost:{PORT}']

    def do_GET(self):
        if not self.valid_host():
            return self.send_error(403)
        path = urlsplit(self.path).path
        if path == '/api/health':
            return self.send_json({'app': 'mock-test', 'version': 1})
        if path == '/api/state':
            with LOCK:
                try:
                    state = json.loads(STATE.read_text()) if STATE.exists() else {'version': 1, 'attempts': []}
                except (OSError, json.JSONDecodeError):
                    return self.send_json({'error': 'Cannot read saved progress'}, 500)
            return self.send_json(state)
        if path == '/data.js' and not (ROOT / 'data.js').exists():
            self.path = '/data.demo.js'
            return super().do_GET()
        if path not in ['/', '/index.html', '/app.js', '/core.js', '/data.js', '/style.css', '/icon.svg'] and not (path.startswith('/assets/') and path.endswith('.webp') and '..' not in path):
            return self.send_error(404)
        return super().do_GET()

    def do_PUT(self):
        if self.path != '/api/state' or not self.valid_host():
            return self.send_error(403)
        if self.headers.get('Origin') not in [None, f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}']:
            return self.send_error(403)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 30_000_000:
                raise ValueError()
            incoming = json.loads(self.rfile.read(length))
        except (ValueError, TypeError):
            return self.send_json({'error': 'Invalid progress data'}, 400)
        with LOCK:
            try:
                existing = json.loads(STATE.read_text()) if STATE.exists() else {'version': 1, 'attempts': []}
                state = merge_state(existing, incoming)
            except (ValueError, TypeError, KeyError):
                return self.send_json({'error': 'Invalid saved state'}, 400)
            try:
                STATE.parent.mkdir(exist_ok=True)
                raw = json.dumps(state, ensure_ascii=False).encode()
                with tempfile.NamedTemporaryFile(dir=STATE.parent, delete=False) as stream:
                    stream.write(raw)
                    stream.flush()
                    os.fsync(stream.fileno())
                    temporary = stream.name
                os.replace(temporary, STATE)
            except OSError:
                return self.send_json({'error': 'Unable to save'}, 500)
        self.send_json({'saved': True, 'state': state})


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
