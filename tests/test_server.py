import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

SPEC = importlib.util.spec_from_file_location('app_server', Path(__file__).resolve().parents[1] / 'server.py')
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)

class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        server.STATE = Path(cls.tmp.name) / 'progress.json'
        server.ROOT = Path(cls.tmp.name)
        (server.ROOT / 'data.demo.js').write_text('window.MOCK_TEST_DATA = [];')
        cls.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        server.PORT = cls.httpd.server_address[1]
        cls.url = f'http://127.0.0.1:{server.PORT}'
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()
        cls.tmp.cleanup()

    def setUp(self):
        server.STATE.unlink(missing_ok=True)

    def request(self, path, data=None, **headers):
        body = json.dumps(data).encode() if data is not None else None
        req = urllib.request.Request(self.url + path, body, headers=headers, method='PUT' if body else 'GET')
        with urllib.request.urlopen(req) as response:
            return response.read()

    def test_stale_writes_preserve_newer_answers_and_other_attempts(self):
        self.request('/api/state', {'version':1, 'updated':100, 'attempts':[{'id':'a','updated':100,'answers':{'x':'B'}}]})
        self.request('/api/state', {'version':1, 'updated':50, 'attempts':[]})
        self.request('/api/state', {'version':1, 'updated':110, 'attempts':[{'id':'b','updated':110,'answers':{}}]})
        self.request('/api/state', {'version':1, 'updated':60, 'attempts':[{'id':'a','updated':60,'answers':{}}]})
        saved = json.loads(self.request('/api/state'))
        self.assertEqual(len(saved['attempts']), 2)
        self.assertEqual(saved['attempts'][0]['answers'], {'x':'B'})

    def test_demo_fallback(self):
        self.assertIn(b'MOCK_TEST_DATA', self.request('/data.js'))

    def test_local_files_are_not_served(self):
        for path in ['/server.py', '/.progress/progress.json', '/local-config.json']:
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request(path)
            self.assertEqual(error.exception.code, 404)

    def test_foreign_origin_and_host_are_rejected(self):
        for headers in [{'Origin':'https://example.com'}, {'Host':'example.com'}]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request('/api/state', {'version':1,'attempts':[]}, **headers)
            self.assertEqual(error.exception.code, 403)

    def test_malformed_state_is_rejected(self):
        for value in [[], {'version':2,'attempts':[]}, {'version':1,'attempts':[{}]}]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request('/api/state', value)
            self.assertEqual(error.exception.code, 400)
