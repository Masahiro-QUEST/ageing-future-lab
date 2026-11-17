"""Import only locally readable dashboard summaries; never claim transcript access."""
import json
import re
from visits_source import LEGACY, ROOT, literal, LiteralReader


def extract():
    text = LEGACY.read_text(encoding='utf-8')
    records = literal('S4_RECORDS')
    for match in re.finditer(r'S4_RECORDS.push\(\s*', text):
        reader = LiteralReader(text[match.end():])
        while True:
            records.append(reader.value())
            if reader.take() != ',':
                break
    existing = {r['id'] for name in ('visits', 'precare') for r in json.loads((ROOT / f'data/{name}.json').read_text())['rows']}
    rows = [r for r in literal('N14_ROWS') if r['id'] not in existing]
    source_ids = {s for r in rows for s in r['sources']}
    sources = {k:v for k,v in literal('N14_SOURCES').items() if k in source_ids}
    events = {
        'E01': ('訪問介護で引き受けられない対応があり、訪問の調整が必要。', 'Home care excludes some tasks and requires visit coordination.'),
        'E02': ('導入した機器が使われず、改善の継続が難しい例。', 'Technology can remain unused and improvement can be hard to sustain.'),
        'E03': ('事業所が何を相談すればよいか整理できない例。', 'Some providers cannot frame what they need help with.'),
        'E04': ('担い手不足と連携コスト。一方、既存支援で両立できる場合も。', 'Staffing and coordination constraints coexist with cases adequately served.'),
        'E05': ('自然体験の長期追跡が限られ、価格・移動も課題。', 'Nature programs have limited long-term follow-up and cost/travel constraints.'),
        'E06': ('初期設定や操作でつまずき、紙とデジタルの連絡が併存。', 'Setup and operation cause friction; paper and digital contact coexist.'),
        'E07': ('家庭の事情を話しにくく、同じ立場の相手が意味を持つ。', 'Family circumstances can be hard to disclose; peers can matter.'),
        'E08': ('ケアマネに何を相談すればよいか分からない相談例。', 'Some callers do not know what to ask their care manager.'),
        'E09': ('通所中は任せられる例も、突然の迎えや変更には対応負担。', 'Some delegate during day care, while sudden pickups and changes add demands.'),
        'E10': ('負担の自覚や相談が難しく、解決策より先に傾聴する実践。', 'Recognizing burden and seeking advice can be difficult; practice starts with listening.')
    }
    for record in records:
        rid = record['id']
        sources[rid] = {'label': record['role'], 'url':'imported-dashboard/index.html#findings'}
        rows.append({'id':rid, 'topic':'fieldwork', 'kind':'interview-summary', 'status':'partial', 'sources':[rid],
                     'problem':dict(zip(('ja','en'), events[rid])), 'result':record['report'], 'scope':record['role'],
                     'limit':record['unknown'], 'trace':record['trace'], 'date':record['date'],
                     'interpretation':record['implication']})
    catalog = literal('S4_SOURCES')
    for match in re.finditer(r'S4_SOURCES.push\(\s*', text):
        reader = LiteralReader(text[match.end():])
        while True:
            catalog.append(reader.value())
            if reader.take() != ',':
                break
    for row in rows:
        row['localLocation'] = 'imported-dashboard/index.html · ' + ('S4_RECORDS / ' if row['kind'] == 'interview-summary' else 'N14_ROWS / ') + row['id']
    return {'provenance':{'legacyFile':'imported-dashboard/index.html','originalSourcesRechecked':False,
                          'transcriptsRead':False}, 'rows':rows,'sources':sources,
            'referenceCatalog':catalog, 'fieldwork':literal('FIELDWORK')[:2]}


if __name__ == '__main__':
    (ROOT / 'data/seminar.json').write_text(json.dumps(extract(),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
