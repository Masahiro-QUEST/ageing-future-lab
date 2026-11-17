"""Read the legacy data literals without executing the dashboard JavaScript."""
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / 'imported-dashboard/index.html'


class LiteralReader:
    token = re.compile(r"\s*(?:(//[^\n]*|/\*[\s\S]*?\*/)|('(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")|([A-Za-z_$][\w$]*)|(-?\d+(?:\.\d+)?)|([\[\]{}():,]))")

    def __init__(self, text):
        self.text, self.pos = text, 0

    def take(self):
        while True:
            m = self.token.match(self.text, self.pos)
            if not m:
                raise ValueError(f'Unsupported literal at {self.pos}')
            self.pos = m.end()
            if not m[1]:
                return m[2] or m[3] or m[4] or m[5]

    def expect(self, token):
        assert self.take() == token, f'Expected {token}'

    def value(self, token=None):
        token = token or self.take()
        if token[0] in "'\"":
            return ast.literal_eval(token)
        if token == 'B':
            self.expect('(')
            en = self.value()
            self.expect(',')
            ja = self.value()
            self.expect(')')
            return {'en': en, 'ja': ja}
        if token in ('[', '{'):
            result = [] if token == '[' else {}
            end = ']' if token == '[' else '}'
            nxt = self.take()
            while nxt != end:
                if token == '[':
                    result.append(self.value(nxt))
                else:
                    key = ast.literal_eval(nxt) if nxt[0] in "'\"" else nxt
                    self.expect(':')
                    if key in result:
                        raise ValueError(f'Duplicate legacy key: {key}')
                    result[key] = self.value()
                nxt = self.take()
                if nxt == ',':
                    nxt = self.take()
                else:
                    assert nxt == end
            return result
        if token in ('true', 'false', 'null'):
            return {'true': True, 'false': False, 'null': None}[token]
        return float(token) if '.' in token else int(token)


def literal(name):
    text = LEGACY.read_text(encoding='utf-8')
    match = re.search(r'\bconst\s+' + re.escape(name) + r'\s*=\s*', text)
    if not match:
        raise ValueError(f'Legacy constant missing: {name}')
    return LiteralReader(text[match.end():]).value()


def legacy_visits():
    topic = next(t for t in literal('N14_TOPICS') if t['id'] == 'visits')
    rows = [r for r in literal('N14_ROWS') if r['topic'] == 'visits']
    source_ids = {s for r in rows for s in r['sources']}
    sources = {k: v for k, v in literal('N14_SOURCES').items() if k in source_ids}
    candidates = [c for c in literal('N14_CANDIDATES') if c['topic'] == 'visits']
    return {'topic': topic, 'rows': rows, 'sources': sources, 'candidates': candidates}
