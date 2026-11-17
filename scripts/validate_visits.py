"""Validate the canonical JSON against the unchanged legacy dashboard."""
import json
from visits_source import ROOT, LEGACY, legacy_visits


def require(ok, message):
    if not ok:
        raise ValueError(message)


def unique(values, label):
    require(len(values) == len(set(values)), f'Duplicate {label}')


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f'Duplicate JSON key: {key}')
        result[key] = value
    return result


def load():
    return json.loads((ROOT / 'data/visits.json').read_text(encoding='utf-8'), object_pairs_hook=no_duplicate_keys)


def validate(data):
    require(data['schemaVersion'] == 1, 'Unsupported schema')
    require(data['asOf'] == '2026-11-14', 'Legacy evidence date changed')
    require(data['provenance']['originalSourcesRechecked'] is False, 'Do not claim source re-verification')
    for key, expected in legacy_visits().items():
        actual = data[key]
        if key == 'rows':
            actual = [{k: v for k, v in row.items() if k != 'followUp'} for row in actual]
        require(actual == expected, f'Legacy data mismatch: {key}')
    require((len(data['rows']), len(data['sources']), len(data['candidates'])) == (5, 8, 1), 'Wrong counts')

    def bilingual(value, path='root'):
        if isinstance(value, dict):
            if 'en' in value or 'ja' in value:
                require(set(value) == {'en', 'ja'}, f'Incomplete languages: {path}')
                require(all(isinstance(v, str) and v.strip() for v in value.values()), f'Empty translation: {path}')
            for k, v in value.items():
                bilingual(v, f'{path}.{k}')
        elif isinstance(value, list):
            for i, v in enumerate(value):
                bilingual(v, f'{path}[{i}]')
    bilingual(data)
    for key in ('rows', 'candidates', 'scenes'):
        unique([x['id'] for x in data[key]], key)
    for row in data['rows']:
        if 'followUp' in row:
            require(row['id'] == 'booked', 'Unexpected source supplement')
            __import__('datetime').date.fromisoformat(row['followUp']['checkedOn'])
            require(set(row['followUp']['account']) == {'ja', 'en'}, 'Supplement translations missing')
    rows = {r['id'] for r in data['rows']}
    for row in data['rows']:
        require(row['topic'] == data['topic']['id'], 'Broken topic reference')
        require(set(row['sources']) <= data['sources'].keys(), 'Broken source reference')
    expected_scenes = {'planned': ['booked'], 'urgent': ['mri'], 'unspecified': ['micin', 'kitami', 'hasuda']}
    require({s['id']: s['evidenceIds'] for s in data['scenes']} == expected_scenes, 'Unsupported timing assignment')
    assigned = [r for s in data['scenes'] for r in s['evidenceIds']]
    unique(assigned, 'scene evidence assignment')
    require(set(assigned) == rows, 'Broken or missing scene evidence reference')
    for scene in data['scenes']:
        for field in ('title', 'unknown', 'next'):
            require(set(scene[field]) == {'ja', 'en'}, f'Missing scene translation: {field}')
    node_ids = {n['id'] for n in __import__('visits_source').literal('NEXT_STEPS')}
    for c in data['candidates']:
        require(c['topic'] == data['topic']['id'], 'Broken candidate topic')
        require(set(c['nodes']) <= node_ids, 'Broken legacy node reference')
        require(f'id="{c["link"][0]}"' in LEGACY.read_text(), 'Broken legacy anchor')
    return data


if __name__ == '__main__':
    validate(load())
    print('PASS: legacy equality; 5 evidence / 8 sources / 1 idea; bilingual fields; unique IDs; references; timing assignments')
