import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('app_launch', Path(__file__).resolve().parents[1] / 'launch.py')
launch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(launch)

class LaunchTests(unittest.TestCase):
    def test_mac_opens_chrome_explicitly(self):
        with patch.object(launch.sys, 'platform', 'darwin'), patch.object(launch.Path, 'exists', return_value=True), patch.object(launch.subprocess, 'run') as run:
            launch.open_page()
        run.assert_called_once_with(['/usr/bin/open', '-a', '/Applications/Google Chrome.app', launch.URL], check=True, timeout=15)

    def test_mac_without_chrome_uses_system_browser(self):
        with patch.object(launch.sys, 'platform', 'darwin'), patch.object(launch.Path, 'exists', return_value=False), patch.object(launch.subprocess, 'run') as run:
            launch.open_page()
        run.assert_called_once_with(['/usr/bin/open', launch.URL], check=True, timeout=15)

    def test_unavailable_browser_reports_failure(self):
        with patch.object(launch.sys, 'platform', 'linux'), patch.object(launch.webbrowser, 'open', return_value=False):
            with self.assertRaises(RuntimeError):
                launch.open_page()
