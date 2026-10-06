import base64
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import ai


class TutorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.request = dict(attempt='attempt-1', question='q1', mode='full', provider='codex', model='',
                            prompt='Be concise', context=dict(text='2+3? A:4 B:5', key='B', answer='A', explanation='The answer is B', disputed=True))

    def tearDown(self):
        self.tmp.cleanup()

    def tutor(self, runner=lambda *_: 'Five'):
        return ai.Tutor(self.root, runner)

    def submit(self, tutor, **changes):
        with patch('ai.executable', return_value='/fake/codex'):
            return tutor.submit(dict(self.request, **changes))

    def test_hint_payload_and_history_are_isolated(self):
        seen = []
        tutor = self.tutor(lambda request, messages, _: seen.append((request, messages)) or 'Response')
        self.submit(tutor); tutor.jobs.join()
        self.submit(tutor, mode='hint'); tutor.jobs.join()
        hint, messages = seen[1]
        for field in ('key', 'explanation', 'disputed'):
            self.assertNotIn(field, hint['context'])
        self.assertEqual(messages, [])
        self.assertEqual(len(tutor.list('attempt-1')), 2)
        self.assertIn('Never reveal', ai.tutor_prompt(hint, []))

    def test_language_controls_prose_and_preserves_original_wording(self):
        for language, prose in [('zh','Chinese'), ('en','English')]:
            request = ai.prepare(dict(self.request, language=language), self.root)
            prompt = ai.tutor_prompt(request, [])
            self.assertIn('Write explanatory prose in ' + prose, prompt)
            self.assertIn('exact original English wording', prompt)
            self.assertIn('Do not translate source wording', prompt)
        with self.assertRaises(ValueError):
            ai.prepare(dict(self.request, language='fr'), self.root)

    def test_languages_keep_separate_saved_conversations(self):
        seen = []
        tutor = self.tutor(lambda request, messages, _: seen.append(messages) or 'Response')
        first = self.submit(tutor, language='zh'); tutor.jobs.join()
        second = self.submit(tutor, language='en'); tutor.jobs.join()
        self.assertNotEqual(first, second)
        self.assertEqual(seen, [[], []])
        self.assertEqual({r['language'] for r in tutor.list('attempt-1')}, {'zh','en'})
        self.submit(tutor, language='en', followup='Why?'); tutor.jobs.join()
        self.assertEqual(len(seen[-1]), 2)

    def test_saved_conversations_followups_and_attempts_are_separate(self):
        seen = []
        tutor = self.tutor(lambda request, messages, _: seen.append(messages) or 'Five')
        identity = self.submit(tutor); tutor.jobs.join()
        self.submit(tutor, followup='Why?'); tutor.jobs.join()
        self.assertEqual(len(seen[1]), 2)
        self.submit(tutor, attempt='attempt-2'); tutor.jobs.join()
        self.assertEqual(seen[2], [])
        saved = ai.Tutor(self.root)
        self.assertEqual(len(saved.list('attempt-1')[0]['messages']), 4)
        self.assertNotIn('request', saved.list('attempt-1')[0])
        self.assertEqual(saved.list('attempt-1')[0]['id'], identity)

    def test_duplicate_requests_do_not_run_twice(self):
        tutor = self.tutor()
        identity = self.submit(tutor); tutor.jobs.join()
        self.assertEqual(self.submit(tutor), identity)
        tutor.jobs.join()
        self.assertEqual(len(tutor.list('attempt-1')[0]['messages']), 2)

    def test_cancel_and_delete_cannot_be_resurrected_by_worker(self):
        entered, released = threading.Event(), threading.Event()
        def runner(*_):
            entered.set(); released.wait(3); return 'Late response'
        tutor = self.tutor(runner)
        self.submit(tutor)
        self.assertTrue(entered.wait(2))
        tutor.stop('attempt-1', remove=True)
        released.set(); tutor.jobs.join()
        self.assertEqual(tutor.list('attempt-1'), [])
        self.assertEqual(json.loads(tutor.path.read_text()), {})

    def test_failed_followup_retries_without_duplicate_messages(self):
        tutor = self.tutor()
        self.submit(tutor); tutor.jobs.join()
        def fail(*_): raise RuntimeError('Please sign in')
        tutor.runner = fail
        self.submit(tutor, followup='Why?'); tutor.jobs.join()
        record = tutor.list('attempt-1')[0]
        self.assertEqual(record['error'], 'Please sign in')
        self.assertEqual(record['followup'], 'Why?')
        self.assertEqual(len(record['messages']), 2)
        tutor.runner = lambda *_: 'Because'
        self.submit(tutor, followup='Why?'); tutor.jobs.join()
        self.assertEqual(len(tutor.list('attempt-1')[0]['messages']), 4)

    def test_restart_marks_unfinished_jobs_retryable(self):
        tutor = self.tutor()
        self.submit(tutor); tutor.jobs.join()
        with tutor.lock:
            next(iter(tutor.records.values()))['status'] = 'running'
            tutor._save()
        restored = self.tutor()
        self.assertEqual(restored.list('attempt-1')[0]['status'], 'error')

    def test_image_sources_cannot_read_arbitrary_files(self):
        (self.root / 'private.txt').write_text('secret')
        (self.root / 'assets').mkdir()
        (self.root / 'assets' / 'link.webp').symlink_to(self.root / 'private.txt')
        for source in ('private.txt', '../private.txt', '/etc/passwd', 'assets/../private.txt', 'assets/link.webp', 'https://example.com/x.png'):
            with self.assertRaises(ValueError):
                ai.image_bytes(self.root, source)
        self.assertEqual(ai.image_bytes(self.root, 'data:image/png;base64,' + base64.b64encode(b'example').decode()), ('png', b'example'))

    def test_missing_provider_and_bad_input_are_actionable(self):
        tutor = self.tutor()
        with patch('ai.executable', return_value=None), self.assertRaisesRegex(ValueError, 'Install and sign in'):
            tutor.submit(self.request)
        for extra in ({'model':'--unsafe command'}, {'mode':'invalid'}, {'context':{}}, {'provider':'bash'}):
            with self.assertRaises(ValueError):
                ai.prepare(dict(self.request, **extra), self.root)


class CLITests(unittest.TestCase):
    def run_fake(self, provider, response, image=False):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            binary = root / 'tool'
            capture = root / 'capture.json'
            # Executable stub exercises stdin, image attachments, process handling and output parsing.
            binary.write_text('#!/usr/bin/env python3\nimport sys,json,pathlib\n'
                              f'pathlib.Path({str(capture)!r}).write_text(json.dumps([sys.argv[1:],sys.stdin.read()]))\n'
                              + ('pathlib.Path(sys.argv[sys.argv.index("--output-last-message")+1]).write_text("Five")\n' if provider == 'codex' else f'print({json.dumps(response)!r})\n'))
            binary.chmod(0o755)
            context = {'text':'2+3?'}
            if image: context['image'] = 'data:image/png;base64,aGVsbG8='
            request = ai.prepare(dict(attempt='a', question='q', mode='full', provider=provider, context=context), root)
            with patch('ai.executable', return_value=str(binary)):
                reply = ai.run_cli(request, [], threading.Event())
            args, stdin = json.loads(capture.read_text())
            return reply, args, stdin

    def test_codex_uses_readonly_images_and_final_output(self):
        reply, args, stdin = self.run_fake('codex', {}, True)
        self.assertEqual(reply, 'Five')
        self.assertIn('read-only', args)
        self.assertIn('--image', args)
        self.assertIn('2+3?', stdin)
        self.assertIn('--ephemeral', args)

    def test_claude_multimodal_input_disables_tools(self):
        reply, args, stdin = self.run_fake('claude', {'result':'Five'}, True)
        self.assertEqual(reply, 'Five')
        self.assertEqual(args[args.index('--tools')+1], '')
        blocks = json.loads(stdin)['message']['content']
        self.assertEqual(blocks[1]['type'], 'image')
        self.assertEqual(blocks[1]['source']['media_type'], 'image/png')

    def test_claude_errors_are_not_explanations(self):
        with self.assertRaisesRegex(RuntimeError, 'could not finish'):
            self.run_fake('claude', {'is_error':True, 'result':'limit reached'})
