import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.request
import urllib.error
import ai
import vocab_review
import vocabulary


class VocabularyReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        self.value = dict(attempt='a', question='@vocabulary', mode='vocabulary', context={
            'questions': [{'id':'q1', 'text':'The lucid explanation was comprehensive.', 'correct':True,
                           'labels':['evasive','lucid'], 'answer':'B', 'key':'B'}], 'known':['lucid']})
        self.word = dict(word='comprehensive', meaning='covering all important parts',
                         quote='The lucid explanation was comprehensive.', note='More than just long.', question='q1')

    def prepared(self, **changes):
        return ai.prepare(dict(self.value, **changes), self.root)

    def queue(self, runner):
        tutor = ai.Tutor(self.root, runner)
        self.addCleanup(tutor.close)
        return tutor

    def submit(self, tutor, **changes):
        with patch('ai.executable', return_value='/fake/codex'):
            identity = tutor.submit(dict(self.value, **changes))
        tutor.jobs.join()
        return identity

    def test_all_materials_known_words_and_correct_answers_reach_prompt(self):
        request = self.prepared()
        prompt = ai.tutor_prompt(request, [])
        for text in ['comprehensive', 'evasive', '"correct": true', '"known": ["lucid"]', 'EVERY', 'correctly answered']:
            self.assertIn(text, prompt)
        self.assertEqual(request['provider'], 'codex')
        self.assertEqual(request['language'], 'en')

    def test_invalid_or_invented_quotes_and_source_ids_fail(self):
        context = self.prepared()['context']
        self.assertEqual(vocab_review.parse(json.dumps({'words':[self.word]}), context), [self.word])
        for changes in [{'question':'unknown'}, {'quote':'comprehensive invented words'}, {'word':'unknown'}, {'note':''}]:
            with self.assertRaises(RuntimeError):
                vocab_review.parse(json.dumps({'words':[dict(self.word, **changes)]}), context)
        self.assertEqual(vocab_review.parse(json.dumps({'words':[dict(self.word, word='lucid')]}),context), [])
        self.assertEqual(vocab_review.parse(json.dumps({'words':[self.word,self.word]}),context), [self.word])

    def test_inflections_share_dictionary_word_familiarity(self):
        context={'questions':[{'id':'q', 'text':'corroborating evidence'}], 'known':[]}
        word=dict(word='corroborating',lemma='corroborate',meaning='supporting',quote='corroborating evidence',note='Independent support.',question='q')
        self.assertEqual(vocab_review.parse(json.dumps({'words':[word]}),context)[0]['lemma'],'corroborate')
        context['known']=['corroborate']
        self.assertEqual(vocab_review.parse(json.dumps({'words':[word]}),context),[])

    def test_saved_review_survives_restart_and_bad_refresh_keeps_previous_list(self):
        tutor = self.queue(lambda *_:json.dumps({'words':[self.word]}))
        self.submit(tutor)
        tutor.runner = lambda *_:'Not JSON'
        self.submit(tutor, refresh=True)
        record = tutor.vocabulary_reviews()[0]
        self.assertEqual(record['status'],'error')
        self.assertEqual(record['words'],[self.word])
        self.assertNotIn('request', record)
        restored = self.queue(lambda *_:'')
        self.assertEqual(restored.vocabulary_reviews()[0]['words'],[self.word])
        tutor.stop('a', remove=True)
        self.assertEqual(tutor.vocabulary_reviews(),[])

    def test_retry_replaces_list_without_accumulating_old_conversation(self):
        seen=[]
        tutor=self.queue(lambda request,messages,_:seen.append(messages) or json.dumps({'words':[self.word]}))
        self.submit(tutor)
        self.submit(tutor, refresh=True)
        self.assertEqual(seen,[[],[]])
        self.assertEqual(len(tutor.vocabulary_reviews()),1)

    def test_multiple_images_are_attached_in_source_order(self):
        questions=[{'id':f'q{i}', 'image':'data:image/png;base64,'+base64.b64encode(f'image{i}'.encode()).decode()} for i in range(2)]
        request=self.prepared(context={'questions':questions})
        capture=self.root/'capture.json'
        binary=self.root/'tool'
        binary.write_text('#!/usr/bin/env python3\nimport sys,json,pathlib\n'
            'args=sys.argv[1:]\n'
            'images=[pathlib.Path(args[i+1]).read_text() for i,a in enumerate(args) if a=="--image"]\n'
            f'pathlib.Path({str(capture)!r}).write_text(json.dumps([args,sys.stdin.read(),images]))\n'
            'pathlib.Path(args[args.index("--output-last-message")+1]).write_text(\'{"words":[]}\')\n')
        binary.chmod(0o755)
        with patch('ai.executable',return_value=str(binary)):
            ai.run_cli(request,[],threading.Event())
        args,prompt,images=json.loads(capture.read_text())
        self.assertEqual(images,['image0','image1'])
        self.assertEqual(args.count('--image'),2)
        self.assertIn('"attached_image": 1',prompt)
        self.assertIn('"attached_image": 2',prompt)
        self.assertNotIn('base64',prompt)

    def test_empty_and_duplicate_source_questions_rejected(self):
        q=self.value['context']['questions'][0]
        for questions in [[],[q,q],[{'id':'q'}]]:
            with self.assertRaises(ValueError):
                self.prepared(context={'questions':questions})

    def test_http_requires_finished_attempt_and_uses_saved_known_words(self):
        spec=importlib.util.spec_from_file_location('vocab_test_server',Path(ai.__file__).with_name('server.py'))
        server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
        server.ROOT=self.root;server.STATE=self.root/'progress.json'
        seen=[]
        server.TUTOR=self.queue(lambda request,*_:seen.append(request) or '{"words":[]}')
        vocabulary.write(self.root, {'version':1,'words':{'lucid':{'status':'mastered','updated':1}}})
        httpd=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        server.PORT=httpd.server_port
        thread=threading.Thread(target=httpd.serve_forever,daemon=True);thread.start()
        def post(value):
            req=urllib.request.Request(f'http://127.0.0.1:{server.PORT}/api/ai/explain',json.dumps(value).encode(),headers={'Content-Type':'application/json'})
            return urllib.request.urlopen(req)
        try:
            server.STATE.write_text(json.dumps({'version':1,'attempts':[{'id':'a','status':'running'}]}))
            with self.assertRaises(urllib.error.HTTPError) as err: post(self.value)
            self.assertEqual(err.exception.code,409)
            server.STATE.write_text(json.dumps({'version':1,'attempts':[{'id':'a','status':'done'}]}))
            value=dict(self.value,context={'questions':self.value['context']['questions'],'known':[]})
            with patch('ai.executable',return_value='/fake/codex'):
                with post(value) as response: self.assertEqual(response.status,202)
            server.TUTOR.jobs.join()
            self.assertEqual(seen[0]['context']['known'],['lucid'])
        finally:
            httpd.shutdown();httpd.server_close();thread.join()
