"""Independent, atomic vocabulary progress storage."""
import json
import math
import os
from pathlib import Path
import re
import tempfile


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError('Invalid vocabulary timestamp or count')
    return value


def empty():
    return {'version': 1, 'updated': 0, 'words': {}, 'prefs': {}, 'history': []}


def normalize(value):
    if not isinstance(value, dict) or value.get('version') != 1 or not isinstance(value.get('words'), dict):
        raise ValueError('Invalid vocabulary progress')
    if len(value['words']) > 5000:
        raise ValueError('Too many vocabulary records')
    out = empty()
    out['updated'] = number(value.get('updated', 0))
    for word, record in value['words'].items():
        if not isinstance(word, str) or not re.fullmatch(r'[a-z][a-z -]{0,63}', word) or not isinstance(record, dict):
            raise ValueError('Invalid vocabulary word')
        if record.get('status') not in ('new', 'learning', 'mastered') or not isinstance(record.get('star', False), bool):
            raise ValueError('Invalid vocabulary status')
        out['words'][word] = {'status': record['status'], 'star': record.get('star', False)}
        for field in ('due', 'streak', 'wrong', 'seen', 'updated'):
            out['words'][word][field] = number(record.get(field, record.get('seen', 0) if field == 'updated' else 0))
        if not isinstance(record.get('visited', False), bool):
            raise ValueError('Invalid vocabulary visit')
        out['words'][word]['visited'] = (record.get('visited', False)
            or out['words'][word]['seen'] > 0 or record['status'] != 'new')
        for field in ('lastVisited', 'lastReviewed', 'lastTested'):
            out['words'][word][field] = number(record.get(field, 0))
            if out['words'][word][field] > 0:
                out['words'][word]['visited'] = True
    prefs = value.get('prefs', {})
    if not isinstance(prefs, dict) or any(not isinstance(v, str) or len(v) > 100 for v in prefs.values()):
        raise ValueError('Invalid vocabulary preferences')
    out['prefs'] = {k: prefs[k] for k in ('tier', 'group', 'status', 'current') if k in prefs}
    history = value.get('history', [])
    if not isinstance(history, list) or len(history) > 1000:
        raise ValueError('Invalid vocabulary history')
    for entry in history:
        if not isinstance(entry, dict) or entry.get('mode') not in ('meaning', 'syn', 'ant'):
            raise ValueError('Invalid vocabulary quiz')
        t, total, correct = (number(entry.get(k)) for k in ('time', 'total', 'correct'))
        if not 0 <= correct <= total <= 400 or int(total) != total or int(correct) != correct:
            raise ValueError('Invalid vocabulary score')
        out['history'].append({'time': t, 'total': total, 'correct': correct, 'mode': entry['mode']})
    return out


def merge(existing, incoming):
    existing, incoming = normalize(existing), normalize(incoming)
    out = empty()
    for state in (existing, incoming):
        for word, record in state['words'].items():
            previous = out['words'].get(word)
            if previous is None:
                out['words'][word] = dict(record)
                continue
            merged = dict(record if record['updated'] >= previous['updated'] else previous)
            # Exposure history is cumulative, even when an older tab resets a status.
            merged['visited'] = previous['visited'] or record['visited']
            for field in ('lastVisited', 'lastReviewed', 'lastTested'):
                merged[field] = max(previous[field], record[field])
            out['words'][word] = merged
    newest = incoming if incoming['updated'] >= existing['updated'] else existing
    out['updated'], out['prefs'] = newest['updated'], newest['prefs']
    history = {(e['time'], e['mode']): e for state in (existing, incoming) for e in state['history']}
    out['history'] = sorted(history.values(), key=lambda e: e['time'])[-100:]
    return out


def read(root):
    path = Path(root) / '.progress' / 'vocabulary.json'
    return normalize(json.loads(path.read_text())) if path.exists() else empty()


def write(root, incoming):
    path = Path(root) / '.progress' / 'vocabulary.json'
    state = merge(read(root), incoming)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
            temporary = stream.name
            stream.write(json.dumps(state, ensure_ascii=False).encode())
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)
    return state
