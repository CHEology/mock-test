#!/usr/bin/env python3
"""Loopback-only static app and atomic local progress storage."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit
import json, os, tempfile
ROOT=Path(__file__).resolve().parent
STATE=ROOT/'.progress'/'progress.json'
LOCK=Lock()
PORT=int(os.environ.get('MOCK_TEST_PORT','17654'))
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Cache-Control','no-store' if self.path.startswith('/api/') else 'no-cache')
        super().end_headers()
    def send_json(self,value,status=200):
        payload=json.dumps(value,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
    def valid_host(self):return self.headers.get('Host') in [f'127.0.0.1:{PORT}',f'localhost:{PORT}']
    def do_GET(self):
        if not self.valid_host():return self.send_error(403)
        path=urlsplit(self.path).path
        if path=='/api/health':return self.send_json({'app':'mock-test','version':1})
        if path=='/api/state':
            with LOCK:
                try:state=json.loads(STATE.read_text()) if STATE.exists() else {'version':1,'attempts':[]}
                except (OSError,json.JSONDecodeError):return self.send_json({'error':'Cannot read saved progress'},500)
            return self.send_json(state)
        if path=='/data.js' and not (ROOT/'data.js').exists():
            self.path='/data.demo.js'
            return super().do_GET()
        if path not in ['/','/index.html','/app.js','/core.js','/data.js','/style.css','/icon.svg'] and not (path.startswith('/assets/') and path.endswith('.webp') and '..' not in path):return self.send_error(404)
        return super().do_GET()
    def do_PUT(self):
        if self.path!='/api/state' or not self.valid_host():return self.send_error(403)
        if self.headers.get('Origin') not in [None,f'http://127.0.0.1:{PORT}',f'http://localhost:{PORT}']:return self.send_error(403)
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=30_000_000:raise ValueError()
            raw=self.rfile.read(length);data=json.loads(raw)
            if not isinstance(data,dict) or data.get('version')!=1 or not isinstance(data.get('attempts'),list):raise ValueError()
        except (ValueError,TypeError):return self.send_json({'error':'Invalid progress data'},400)
        with LOCK:
            STATE.parent.mkdir(exist_ok=True)
            try:
                existing=json.loads(STATE.read_text()) if STATE.exists() else {'version':1,'attempts':[]}
                merged={a['id']:a for a in existing.get('attempts',[])}
                for a in data['attempts']:
                    if not isinstance(a,dict) or not isinstance(a.get('id'),str):raise ValueError('Invalid attempt')
                    old=merged.get(a['id'])
                    incoming_time=a.get('updated',data.get('updated',a.get('created',0)))
                    old_time=(old or {}).get('updated',existing.get('updated',(old or {}).get('created',0)))
                    if old is None or incoming_time>=old_time:
                        a['updated']=incoming_time;merged[a['id']]=a
                data['attempts']=sorted(merged.values(),key=lambda a:a.get('created',0))
                data['updated']=max(data.get('updated',0),existing.get('updated',0))
                raw=json.dumps(data,ensure_ascii=False).encode()
            except (ValueError,TypeError,KeyError):return self.send_json({'error':'Invalid saved state'},400)
            try:
                with tempfile.NamedTemporaryFile(dir=STATE.parent,delete=False) as f:f.write(raw);f.flush();os.fsync(f.fileno());tmp=f.name
                os.replace(tmp,STATE)
            except OSError:return self.send_json({'error':'Unable to save'},500)
        self.send_json({'saved':True})
if __name__=='__main__':
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
