import json
from pathlib import Path
import tempfile
import unittest
import vocabulary


def progress(word, time, status='learning', **changes):
    return {'version':1,'updated':time,'prefs':{'tier':'core'},'words':{word:{'status':status,'star':False,'updated':time,**changes}},'history':[]}


class VocabularyTests(unittest.TestCase):
    def test_visits_survive_disk_reload_and_legacy_tab_updates(self):
        with tempfile.TemporaryDirectory() as tmp:
            vocabulary.write(tmp, progress('abet',100,'new',visited=True,lastVisited=100,lastReviewed=90))
            vocabulary.write(tmp, progress('abet',200,'new'))
            row=vocabulary.read(tmp)['words']['abet']
            self.assertTrue(row['visited'])
            self.assertEqual(row['lastVisited'],100)
            self.assertEqual(row['lastReviewed'],90)
            self.assertEqual(row['lastTested'],0)

    def test_legacy_activity_migrates_without_inventing_review_or_test_dates(self):
        row=vocabulary.normalize(progress('abet',100,seen=80))['words']['abet']
        self.assertTrue(row['visited'])
        self.assertEqual(row['lastReviewed'],0)
        self.assertEqual(row['lastTested'],0)
        favorite=vocabulary.normalize(progress('abet',100,'new',star=True))['words']['abet']
        self.assertFalse(favorite['visited'])

    def test_invalid_visit_fields_are_rejected(self):
        for fields in [dict(visited='yes'),dict(lastVisited=-1),dict(lastReviewed=float('nan')),dict(lastTested=True)]:
            with self.assertRaises(ValueError):
                vocabulary.normalize(progress('abet',100,**fields))

    def test_stale_tab_cannot_erase_newer_word_or_other_words(self):
        a=vocabulary.merge(vocabulary.empty(), progress('abet',100,'mastered'))
        a=vocabulary.merge(a,progress('obsolete',150))
        a=vocabulary.merge(a,progress('abet',50,'new'))
        self.assertEqual(a['words']['abet']['status'],'mastered')
        self.assertEqual(a['words']['obsolete']['status'],'learning')
        self.assertEqual(a['updated'],150)

    def test_explicit_reset_and_unfavorite_are_saved(self):
        a=vocabulary.merge(vocabulary.empty(),progress('abet',100,'mastered',star=True))
        a=vocabulary.merge(a,progress('abet',200,'new',star=False))
        self.assertEqual(a['words']['abet']['status'],'new')
        self.assertFalse(a['words']['abet']['star'])

    def test_vocabulary_does_not_touch_exam_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'.progress';p.mkdir();exam=p/'progress.json';exam.write_text('{"version":1,"attempts":[{"id":"real","answers":{"q":"B"}}]}')
            before=exam.read_bytes()
            vocabulary.write(tmp,progress('abet',100))
            self.assertEqual(exam.read_bytes(),before)
            self.assertEqual(vocabulary.read(tmp)['words']['abet']['updated'],100)
            self.assertEqual(len(list(p.iterdir())),2)

    def test_invalid_update_does_not_replace_saved_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            vocabulary.write(tmp,progress('abet',100))
            for bad in [[],{'version':2,'words':{}},progress('abet',200,status='bad'),progress('abet',float('nan')),progress('abet',200,due=-1),progress('../x',200)]:
                with self.assertRaises(ValueError):vocabulary.write(tmp,bad)
                self.assertEqual(vocabulary.read(tmp)['words']['abet']['updated'],100)

    def test_history_merges_without_duplicates_and_limits_size(self):
        a=progress('abet',100);a['history']=[{'time':i,'total':10,'correct':8,'mode':'syn'} for i in range(150)]
        m=vocabulary.merge(vocabulary.merge(vocabulary.empty(),a),a)
        self.assertEqual(len(m['history']),100)
        self.assertEqual(m['history'][0]['time'],50)

if __name__=='__main__':unittest.main()
