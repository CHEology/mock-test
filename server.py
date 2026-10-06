#!/usr/bin/env python3
"""Loopback-only static app and atomic local progress storage."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit, parse_qs
import json
import math
import signal
import os
import tempfile
import ai

ROOT = Path(__file__).resolve().parent
STATE = ROOT / '.progress' / 'progress.json'
LOCK = Lock()
PORT = int(os.environ.get('MOCK_TEST_PORT', '17654'))
TUTOR = None

def tutor():
    global TUTOR
    if TUTOR is None:
        TUTOR = ai.Tutor(ROOT)
    return TUTOR


def timestamp(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError('Invalid timestamp')
    return value


def merge_state(existing, incoming):
    deleted, attempts, library = {}, {}, {}
    for state in (existing, incoming):
        if not isinstance(state, dict) or state.get('version') != 1 or not isinstance(state.get('attempts'), list):
            raise ValueError('Invalid state')
        timestamp(state.get('updated', 0))
        records = state.get('library', [])
        if not isinstance(records, list):
            raise ValueError('Invalid library')
        for item in records:
            if (not isinstance(item, dict) or not isinstance(item.get('id'), str)
                    or item.get('kind') not in ('category', 'folder', 'test')
                    or not isinstance(item.get('name'), str)
                    or not isinstance(item.get('trashed', False), bool)):
                raise ValueError('Invalid library item')
            timestamp(item.get('updated', 0))
            old = library.get(item['id'])
            if old is None or item.get('updated', 0) >= old.get('updated', 0):
                library[item['id']] = item
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
        'library': list(library.values()),
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
        if path.startswith('/api/ai/'):
            if not self.valid_origin():
                return self.send_error(403)
            try:
                with LOCK:
                    if path == '/api/ai/providers':
                        return self.send_json({p: bool(ai.executable(p)) for p in ('codex', 'claude')})
                    if path == '/api/ai/conversations':
                        attempt = parse_qs(urlsplit(self.path).query).get('attempt', [''])[0]
                        return self.send_json(tutor().list(attempt))
                return self.send_error(404)
            except (OSError, ValueError):
                return self.send_json({'error': 'Cannot read saved explanations'}, 500)
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
        if path not in ['/', '/index.html', '/app.js', '/core.js', '/library.js', '/library-ui.js', '/ai.js', '/data.js', '/style.css', '/icon.svg'] and not (path.startswith('/assets/') and path.endswith('.webp') and '..' not in path):
            return self.send_error(404)
        return super().do_GET()

    def valid_origin(self):
        return (self.headers.get('Origin') in [None, f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}']
                and self.headers.get('Sec-Fetch-Site') not in ('cross-site',))

    def do_POST(self):
        if not self.valid_host() or not self.valid_origin():
            return self.send_error(403)
        if self.path not in ('/api/ai/explain', '/api/ai/stop'):
            return self.send_error(404)
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.send_error(415)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 15_000_000:
                raise ValueError('Invalid request size')
            value = json.loads(self.rfile.read(length))
            if not isinstance(value, dict):
                raise ValueError('Invalid request')
            with LOCK:
                state = json.loads(STATE.read_text()) if STATE.exists() else {}
                attempt = value.get('attempt')
                if not any(a['id'] == attempt for a in state.get('attempts', [])) or attempt in state.get('deleted', {}):
                    return self.send_json({'error': 'Save this attempt before requesting an explanation'}, 409)
                if self.path == '/api/ai/stop':
                    tutor().stop(attempt, value.get('id'))
                    return self.send_json({'stopped': True})
                identity = tutor().submit(value)
            return self.send_json({'id': identity}, 202)
        except (ValueError, TypeError, AttributeError) as exc:
            return self.send_json({'error': str(exc) or 'Invalid request'}, 400)
        except OSError:
            return self.send_json({'error': 'Cannot save explanations'}, 500)

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
                if TUTOR is not None or (ROOT / '.progress' / 'explanations.json').exists():
                    tutor()
                    for identity in state['deleted']:
                        if TUTOR.list(identity):
                            TUTOR.stop(identity, remove=True)
            except OSError:
                return self.send_json({'error': 'Unable to save'}, 500)
        self.send_json({'saved': True, 'state': state})


if __name__ == '__main__':
    def stop_server(*_):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, stop_server)
    httpd = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        if TUTOR is not None:
            TUTOR.close()
