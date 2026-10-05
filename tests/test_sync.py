import importlib.util
from pathlib import Path
import tempfile
import plistlib
import sys
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('app_sync', Path(__file__).resolve().parents[1] / 'sync.py')
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)

class SyncTests(unittest.TestCase):
    def test_sync_updates_code_and_bank_without_touching_progress(self):
        with tempfile.TemporaryDirectory() as tmp:
            sync.ROOT = Path(tmp) / 'source'
            sync.ROOT.mkdir()
            sync.CONFIG = sync.ROOT / 'local-config.json'
            for name in sync.SHARED:
                (sync.ROOT / name).write_text('new shared file')
            (sync.ROOT / 'data.js').write_text('private questions')
            (sync.ROOT / 'icon.icns').write_bytes(b'example icon')
            (sync.ROOT / 'assets').mkdir()
            (sync.ROOT / 'assets' / '01.webp').write_bytes(b'question image')
            destination = Path(tmp) / 'installed'
            (destination / '.progress').mkdir(parents=True)
            saved = destination / '.progress' / 'progress.json'
            saved.write_text('{"existing": "answers"}')
            def build(command, **kwargs):
                if 'swiftc' in command:
                    Path(command[-1]).touch()
            with patch.object(sync.subprocess, 'run', side_effect=build):
                sync.sync(destination)
            for name in sync.SHARED:
                self.assertEqual((destination / name).read_bytes(), (sync.ROOT / name).read_bytes())
            self.assertEqual((destination / 'data.js').read_text(), 'private questions')
            self.assertEqual(saved.read_text(), '{"existing": "answers"}')

            if sys.platform == 'darwin':
                contents = destination / 'Mock Test.app' / 'Contents'
                with (contents / 'Info.plist').open('rb') as stream:
                    info = plistlib.load(stream)
                self.assertEqual(info['CFBundleIconFile'], 'MockTest.icns')
                self.assertEqual((contents / 'Resources' / info['CFBundleIconFile']).read_bytes(), b'example icon')
