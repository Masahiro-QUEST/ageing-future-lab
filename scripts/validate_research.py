"""Validate seminar evidence identity, provenance, placement and bilingual comparisons."""
import json
import datetime
from urllib.parse import urlparse
from validate_visits import ROOT, load, validate, require, unique, no_duplicate_keys
from visits_source import literal
from import_seminar import extract


def read(name):
    return json.loads((ROOT / f'data/{name}.json').read_text(encoding='utf-8'), object_pairs_hook=no_duplicate_keys)


def bilingual(value, path='research'):
    require(isinstance(value, dict) and set(value) == {'ja', 'en'}, f'Missing bilingual field: {path}')
    require(all(isinstance(v, str) and v.strip() for v in value.values()), f'Empty translation: {path}')


def validate_support_comparisons(data, evidence_ids):
    expected = {'appointments', 'dialogue', 'access', 'discharge', 'cost', 'respite', 'implementation'}
    require(set(data['comparisons']) == expected, 'Missing task-specific comparisons')
    unique([o['id'] for o in data['options']], 'support option IDs')
    references = data['references']
    unique([r['url'] for r in references.values()], 'support source URLs')
    for reference in references.values():
        for field in ('label', 'coverage'):
            bilingual(reference[field])
        if reference['checkedOn'] is None:
            require(reference.get('verification') == 'catalog-only', 'Unknown source date must be explicit')
        else:
            datetime.date.fromisoformat(reference['checkedOn'])
        url = urlparse(reference['url'])
        require(url.scheme == 'https' and bool(url.netloc), 'Invalid support source URL')
    option_ids = {o['id'] for o in data['options']}
    for option in data['options']:
        for field in ('name', 'booking', 'scope', 'price', 'coordination'):
            bilingual(option[field])
        require(option['status'] in {'documented', 'candidate', 'family'}, 'Unsupported option status')
        unique(option['referenceIds'], 'option source references')
        require(set(option['referenceIds']) <= references.keys(), 'Broken support source reference')
        require(set(option['evidenceIds']) <= evidence_ids, 'Broken support evidence reference')
        require(option['status'] == 'family' or bool(option['referenceIds']), 'Named option needs a source')
    valid_ids = option_ids | {'provider:' + p['id'] for p in data['providers']} | {'alternative:0', 'alternative:1', 'alternative:2', 'alternative:3'}
    for comparison in data['comparisons'].values():
        for field in ('goal', 'hypothesis', 'unknown', 'remaining'):
            bilingual(comparison[field])
        require(len(comparison['columns']) == 5, 'Expected five task-specific columns')
        for label in comparison['columns']:
            bilingual(label)
        unique(comparison['optionIds'], 'comparison options')
        extra = comparison.get('supplementaryOptionIds', [])
        require(set(extra) <= valid_ids and not set(extra) & set(comparison['optionIds']), 'Invalid supplementary options')
        require(bool(comparison['optionIds']) and set(comparison['optionIds']) <= valid_ids, 'Broken comparison option')

    appt = data['comparisons']['appointments']
    require(appt['optionIds'] == ['provider:nanairo', 'provider:odekake'] + [f'alternative:{i}' for i in range(4)], 'Appointment example must reuse two providers and four alternatives')
    require([a['id'] for a in appt['axes']] == ['timing', 'support', 'preference', 'cost', 'coordination'], 'Appointment axes mismatch')
    for axis in appt['axes']:
        bilingual(axis['label'])

    def provision(value, has_sources):
        require(value['state'] in {'offered', 'pilot', 'unconfirmed', 'unresearched'}, 'Invalid provision state')
        bilingual(value['basis'])
        require(set(value['referenceIds']) <= references.keys(), 'Broken provision source')
        require(set(value['evidenceIds']) <= evidence_ids, 'Broken provision evidence')
        if value['checkedOn'] is not None:
            datetime.date.fromisoformat(value['checkedOn'])
        if value['state'] in {'offered', 'pilot'}:
            require(has_sources and value['checkedOn'] is not None, 'Offered/pilot needs a source and recorded date')
            require(all(references[r]['checkedOn'] is not None and references[r].get('verification') != 'catalog-only' for r in value['referenceIds']), 'Catalog-only sources cannot confirm provision')
        if value['state'] == 'pilot':
            require(bool(value['referenceIds']), 'Pilot requires a stage source')
            bilingual(value.get('stage'))
    for row in data['providers'] + data['options']:
        provision(row['provision'], bool(row.get('links') or row.get('referenceIds')))
    require(len(data['alternativeProvision']) == 4, 'Missing alternative provision states')
    for value in data['alternativeProvision']:
        provision(value, False)


def validate_research(r=None, p=None, v=None):
    r = read('research') if r is None else r
    p = read('precare') if p is None else p
    v = load() if v is None else v
    validate(v)
    seminar = read('seminar')
    require(seminar == extract(), 'Local seminar extraction/provenance mismatch')
    require(r['schemaVersion'] == 2 and r['status'] == 'exploring', 'Research must remain open')
    require(not {'selectedCandidateId', 'selectedProblemId', 'selection'} & r.keys(), 'No problem selection authorized')
    expected = [row for row in literal('N14_ROWS') if row['id'] in ('works', 'duskin')]
    require(p['rows'] == expected and p['provenance']['originalSourcesRechecked'] is False, 'Precare migration mismatch')
    source_ids = {s for row in expected for s in row['sources']}
    require(p['sources'] == {k:val for k,val in literal('N14_SOURCES').items() if k in source_ids}, 'Precare source mismatch')
    rows = v['rows'] + p['rows'] + seminar['rows']
    unique([row['id'] for row in rows], 'cross-dataset evidence IDs')
    unique(list(v['sources']) + list(p['sources']) + list(seminar['sources']), 'cross-dataset source IDs')
    evidence_ids = {row['id'] for row in rows}
    for field in ('mission','vision','origin','headline','intro','limitations','alternativeComparisonSummary'):
        bilingual(r[field],field)
    for collection in ('stages','actors','findings','candidates','axes','inventory'):
        unique([x['id'] for x in r[collection]], collection)
    require({x['id'] for x in r['stages']} == {'before','onset','daily'}, 'Stage structure mismatch')
    require({x['id'] for x in r['actors']} == {'parent','family','provider'}, 'Actor structure mismatch')
    axes = {'impact','market','gap','risk'}
    require({a['id'] for a in r['axes']} == axes, 'Comparison axes mismatch')
    for coll in ('stages','actors','axes'):
        for item in r[coll]:
            bilingual(item['title'])
    unique([(x['actor'],x['stage']) for x in r['placements']], 'matrix cells')
    placed = set()
    for cell in r['placements']:
        require(cell['actor'] in {x['id'] for x in r['actors']} and cell['stage'] in {x['id'] for x in r['stages']}, 'Invalid placement')
        placed.update(cell['evidenceIds'])
    unplaced = set()
    for group in r['unplaced']:
        bilingual(group['reason'])
        unplaced.update(group['evidenceIds'])
    require(placed | unplaced == evidence_ids, 'Evidence missing from landscape or unplaced material')
    require(not placed & unplaced, 'Evidence cannot be both placed and unplaced')
    require(1 <= len(r['findings']) <= 3, 'At most three candidate insights')
    for finding in r['findings']:
        require(len(finding['evidenceIds']) >= 2, 'Insight must compare sources')
        for field in ('title','compare','interpretation','unknown'):
            bilingual(finding[field])
    require({c['id'] for c in r['candidates']} == {'dialogue','access','appointments','cost','respite','implementation','discharge'}, 'Candidate coverage mismatch')
    for candidate in r['candidates']:
        bilingual(candidate['title'])
        require(set(candidate['overview']) == {'title','impact','scale','gap','risk'}, 'Missing compact overview fields')
        for value in candidate['overview'].values():
            bilingual(value)
        require(set(candidate['overviewEvidenceIds']) == {'impact', 'scale'}, 'Missing overview evidence references')
        for ids in candidate['overviewEvidenceIds'].values():
            unique(ids, 'overview evidence IDs')
            require(set(ids) <= set(candidate['evidenceIds']), 'Overview evidence must belong to candidate')
        bilingual(candidate['next'])
        if candidate['id'] != 'appointments':
            bilingual(candidate['existingMeans'])
        require(set(candidate['cells']) == axes, 'Missing comparison cell')
        for cell in candidate['cells'].values():
            for field in ('known','interpretation','unknown','next'):
                bilingual(cell[field])
    for item in r['inventory']:
        bilingual(item['title']); bilingual(item['read'])
        require(isinstance(item['missing'],bool), 'Inventory access status missing')
    require(r['flow']['status'] == 'hypothetical', 'Flow must remain hypothetical')
    for field in ('steps','outcomes'):
        for item in r['flow'][field]:
            bilingual(item)
    require(len(r['alternatives']) == 4, 'Expected four alternatives')
    for alternative in r['alternatives']:
        bilingual(alternative['title']); bilingual(alternative['body'])
        require(set(alternative['cells']) == {'timing','support','preference','cost','coordination'}, 'Missing alternative comparison axis')
        for cell in alternative['cells'].values():
            bilingual(cell)
    candidate_ids = {c['id'] for c in r['candidates']}
    for collection in ('problemTree', 'businessIdeas'):
        unique([x['candidateId'] for x in r[collection]], collection)
        require({x['candidateId'] for x in r[collection]} == candidate_ids, 'Tree / business candidate mismatch')
    for node in r['problemTree']:
        bilingual(node['branch']); bilingual(node['scene'])
    for idea in r['businessIdeas']:
        bilingual(idea['payment'])
        require(set(idea) == {'candidateId', 'payment'}, 'Unestimated ideas must not contain unsupported estimates')
    competitors=read('competitors')
    datetime.date.fromisoformat(competitors['checkedOn'])
    bilingual(competitors['scenario'])
    unique([p['id'] for p in competitors['providers']], 'competitor IDs')
    require({p['id'] for p in competitors['providers']} == {'nanairo','odekake','crowdcare','fureai'}, 'Expected four documented services')
    for provider in competitors['providers']:
        for field in ('name','area','booking','scope','price','priceExample','check','preference','coordination'):
            bilingual(provider[field])
        require(bool(provider['links']), 'Missing official URL')
        unique([link['url'] for link in provider['links']], 'provider source URLs')
        for link in provider['links']:
            bilingual(link['label'])
            require(urlparse(link['url']).scheme == 'https' and bool(urlparse(link['url']).netloc), 'Invalid official URL')

    validate_support_comparisons(competitors, evidence_ids)

    def refs(value):
        if isinstance(value,dict):
            require(not {'result','scope','sources','partial'} & value.keys(), 'Evidence body duplicated in research narrative')
            for key,val in value.items():
                if key == 'evidenceIds':
                    unique(val,'evidence references')
                    require(set(val) <= evidence_ids,'Broken evidence reference')
                else:
                    refs(val)
        elif isinstance(value,list):
            for val in value:
                refs(val)
    refs(r)
    return r


if __name__ == '__main__':
    validate_research()
    print('PASS: seminar provenance, unique evidence, landscape, unselected candidates, translations and references')
