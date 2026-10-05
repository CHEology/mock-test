#!/usr/bin/env python3
"""Start the local app and open its browser window."""
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

def open_page():
    if sys.platform == 'darwin':
        candidates = (Path('/Applications/Google Chrome.app'),
                      Path.home() / 'Applications/Google Chrome.app')
        chrome = next((path for path in candidates if path.exists()), None)
        command = ['/usr/bin/open']
        if chrome:
            command += ['-a', str(chrome)]
        subprocess.run(command + [URL], check=True, timeout=15)
    elif not webbrowser.open(URL, new=2):
        raise RuntimeError(f'Could not open a browser. Open {URL} manually.')


def main():
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
    open_page()


if __name__ == '__main__':
    try:
        main()
    except (Exception, SystemExit) as error:
        message = str(error)
        print(message, file=sys.stderr)
        if sys.platform == 'darwin':
            script = 'on run argv\ndisplay alert "Mock Test could not open" message (item 1 of argv)\nend run'
            subprocess.run(['/usr/bin/osascript', '-e', script, message], check=False)
        raise SystemExit(1)
