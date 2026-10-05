#!/usr/bin/env python3
"""Synchronize an installed copy without copying or replacing saved attempts."""
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / 'local-config.json'
SHARED = ('index.html', 'style.css', 'app.js', 'core.js', 'icon.svg',
          'data.demo.js', 'library.js', 'library-ui.js', 'server.py', 'launch.py')

def sync(destination):
    destination = Path(destination).expanduser().resolve()
    if destination == ROOT:
        raise ValueError('Choose a destination different from the source directory.')
    destination.mkdir(parents=True, exist_ok=True)
    for name in SHARED:
        shutil.copy2(ROOT / name, destination / name)
    if (ROOT / 'data.js').exists():
        shutil.copy2(ROOT / 'data.js', destination / 'data.js')
    if (ROOT / 'assets').exists():
        shutil.copytree(ROOT / 'assets', destination / 'assets', dirs_exist_ok=True)
    if sys.platform == 'darwin':
        contents = destination / 'Mock Test.app' / 'Contents'
        (contents / 'MacOS').mkdir(parents=True, exist_ok=True)
        (contents / 'Resources').mkdir(exist_ok=True)
        shutil.copy2(ROOT / 'icon.icns', contents / 'Resources' / 'MockTest.icns')
        with (contents / 'Info.plist').open('wb') as stream:
            plistlib.dump({
                'CFBundleExecutable': 'launch',
                'CFBundleIdentifier': 'local.mocktest.app',
                'CFBundleName': 'Mock Test',
                'CFBundleIconFile': 'MockTest.icns',
                'CFBundlePackageType': 'APPL',
                'CFBundleVersion': '1.0.2',
                'NSDesktopFolderUsageDescription': 'Read your local question files and save your practice progress.',
                'LSUIElement': True,
            }, stream)
        executable = contents / 'MacOS' / 'launch'
        subprocess.run(['xcrun', 'swiftc', str(ROOT / 'macos' / 'Launcher.swift'),
                        '-o', str(executable)], check=True)
        executable.chmod(0o755)
        for item in [contents.parent, *contents.parent.rglob('*')]:
            for attribute in ('com.apple.FinderInfo', 'com.apple.ResourceFork'):
                subprocess.run(['xattr', '-d', attribute, str(item)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        subprocess.run(['codesign', '--force', '--sign', '-', str(contents.parent)], check=True)
    CONFIG.write_text(json.dumps({'destination': str(destination)}, indent=2) + '\n')
    return destination

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else json.loads(CONFIG.read_text())['destination'] if CONFIG.exists() else None
    if not target:
        raise SystemExit('Usage: python3 sync.py /path/to/local-copy')
    print(f'Updated {sync(target)}')
