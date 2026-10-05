#!/usr/bin/env python3
"""Start the local app and open it in the default browser."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get('MOCK_TEST_PORT', '17654'))
URL = f'http://127.0.0.1:{PORT}'

def running():
    try:
        with urllib.request.urlopen(URL + '/api/health', timeout=1) as response:
            return json.load(response).get('app') == 'mock-test'
    except (OSError, ValueError):
        return False

if __name__ == '__main__':
    if not running():
        logs = ROOT / '.progress'
        logs.mkdir(exist_ok=True)
        with (logs / 'server.log').open('ab') as log:
            process = subprocess.Popen(
                [sys.executable, str(ROOT / 'server.py')],
                stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                start_new_session=True,
            )
        for _ in range(40):
            if running():
                break
            if process.poll() is not None:
                raise SystemExit('Could not start the server. Check .progress/server.log or choose another port.')
            time.sleep(0.1)
        else:
            raise SystemExit('The server did not start. Check .progress/server.log.')
    webbrowser.open(URL)
