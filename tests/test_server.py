import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import ai
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
        if server.TUTOR is not None:
            server.TUTOR.close()
            server.TUTOR = None
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

    def test_deleted_attempt_never_returns_from_a_stale_tab(self):
        self.request('/api/state', {'version':1,'updated':100,'attempts':[{'id':'a','updated':100,'answers':{'q':'B'}},{'id':'b','updated':100}]})
        reply = json.loads(self.request('/api/state', {'version':1,'updated':200,'attempts':[],'deleted':{'a':200}}))
        self.assertEqual([a['id'] for a in reply['state']['attempts']], ['b'])
        self.request('/api/state', {'version':1,'updated':300,'attempts':[{'id':'a','updated':300,'answers':{'q':'A'}}]})
        saved = json.loads(self.request('/api/state'))
        self.assertEqual([a['id'] for a in saved['attempts']], ['b'])
        self.assertEqual(saved['deleted'], {'a':200})

    def test_independent_deletions_are_preserved(self):
        self.request('/api/state', {'version':1,'attempts':[],'deleted':{'a':100}})
        self.request('/api/state', {'version':1,'attempts':[],'deleted':{'b':200}})
        self.assertEqual(json.loads(self.request('/api/state'))['deleted'], {'a':100,'b':200})

    def test_invalid_deletions_cannot_remove_saved_answers(self):
        self.request('/api/state', {'version':1,'attempts':[{'id':'a','answers':{'q':'B'}}]})
        for deleted in [[], {'a':'bad'}, {'a':float('inf')}, {'a':-1}]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request('/api/state', {'version':1,'attempts':[],'deleted':deleted})
            self.assertEqual(error.exception.code,400)
        saved=json.loads(self.request('/api/state'))
        self.assertEqual(saved['attempts'][0]['answers'],{'q':'B'})

    def test_library_merges_without_changing_attempts(self):
        base = {'id':'folder','kind':'folder','name':'Full tests','parent':'category','updated':10,'trashed':False}
        self.request('/api/state', {'version':1,'attempts':[{'id':'answer','answers':{'q':'A'}}],'library':[base]})
        self.request('/api/state', {'version':1,'attempts':[],'library':[dict(base,name='Writing',updated=20,trashed=True)]})
        self.request('/api/state', {'version':1,'attempts':[],'library':[base]})
        self.request('/api/state', {'version':1,'attempts':[]})
        saved=json.loads(self.request('/api/state'))
        self.assertEqual(saved['library'][0]['name'],'Writing')
        self.assertTrue(saved['library'][0]['trashed'])
        self.assertEqual(saved['attempts'][0]['answers'],{'q':'A'})

    def test_library_deletion_survives_newer_stale_writes(self):
        base = {'id':'test-1','kind':'test','name':'Example','testId':1,'updated':10}
        self.request('/api/state', {'version':1,'attempts':[], 'library':[dict(base,deleted=True,updated=20)]})
        self.request('/api/state', {'version':1,'attempts':[], 'library':[dict(base,updated=999)]})
        saved=json.loads(self.request('/api/state'))
        self.assertTrue(saved['library'][0]['deleted'])

    def test_invalid_library_does_not_replace_saved_state(self):
        state={'version':1,'attempts':[],'library':[{'id':'cat','kind':'category','name':'Practice','updated':1}]}
        self.request('/api/state',state)
        for records in [{},[{'id':'bad','kind':'unknown','name':'X'}],[{'id':'bad','kind':'category','name':'X','updated':float('nan')}]]:
            with self.assertRaises(urllib.error.HTTPError):
                self.request('/api/state',dict(state,library=records))
        self.assertEqual(json.loads(self.request('/api/state'))['library'],state['library'])

    def post(self, path, value, **headers):
        request = urllib.request.Request(self.url + path, json.dumps(value).encode(),
            headers={'Content-Type':'application/json', **headers}, method='POST')
        with urllib.request.urlopen(request) as response:
            return json.load(response)

    def test_ai_rejects_cross_site_requests_and_deleted_attempts(self):
        value = dict(attempt='a', question='q', mode='full', provider='codex', context={'text':'2+3?'})
        for headers in ({'Origin':'https://example.com'}, {'Sec-Fetch-Site':'cross-site'}, {'Host':'bad.example'}):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.post('/api/ai/explain', value, **headers)
            self.assertEqual(error.exception.code, 403)
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.post('/api/ai/explain', value)
        self.assertEqual(error.exception.code, 409)
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.post('/api/ai/explain', value, **{'Content-Type':'text/plain'})
        self.assertEqual(error.exception.code, 415)

    def test_ai_conversation_survives_state_save_and_is_removed_with_attempt(self):
        if server.TUTOR: server.TUTOR.close()
        server.TUTOR = ai.Tutor(server.ROOT, lambda *_: 'Five')
        self.request('/api/state', {'version':1,'attempts':[{'id':'explain-a','answers':{'q':'A'}}]})
        value = dict(attempt='explain-a', question='q', mode='full', provider='codex', context={'text':'2+3?','key':'B'})
        with patch('ai.executable', return_value='/fake/codex'):
            self.post('/api/ai/explain', value)
        server.TUTOR.jobs.join()
        self.request('/api/state', {'version':1,'attempts':[{'id':'explain-a','answers':{'q':'B'}}]})
        records = json.loads(self.request('/api/ai/conversations?attempt=explain-a'))
        self.assertEqual(records[0]['messages'][-1]['text'], 'Five')
        self.request('/api/state', {'version':1,'attempts':[],'deleted':{'explain-a':123}})
        self.assertEqual(json.loads(self.request('/api/ai/conversations?attempt=explain-a')), [])
        self.assertEqual(json.loads(server.TUTOR.path.read_text()), {})

    def test_ai_storage_is_not_a_static_download(self):
        for path in ('/ai.py', '/.progress/explanations.json'):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request(path)
            self.assertEqual(error.exception.code, 404)
