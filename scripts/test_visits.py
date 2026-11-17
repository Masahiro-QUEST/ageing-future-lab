"""Regression checks, including deliberate corruption of the migration."""
import copy
import hashlib
import http.server
import json
import subprocess
import threading
import unittest
import urllib.request
from functools import partial
from validate_visits import ROOT, load, validate, no_duplicate_keys


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.data = load()

    def reject(self, change):
        data = copy.deepcopy(self.data)
        change(data)
        with self.assertRaises(ValueError):
            validate(data)

    def test_valid(self):
        validate(self.data)

    def test_changed_legacy_text(self):
        self.reject(lambda d: d['rows'][0]['result'].update(ja='changed'))

    def test_missing_english(self):
        self.reject(lambda d: d['scenes'][0]['next'].pop('en'))

    def test_duplicate_id(self):
        self.reject(lambda d: d['scenes'].append(copy.deepcopy(d['scenes'][0])))

    def test_broken_source(self):
        self.reject(lambda d: d['rows'][0]['sources'].append('missing'))

    def test_broken_scene_reference(self):
        self.reject(lambda d: d['scenes'][0]['evidenceIds'].append('missing'))

    def test_inferred_timing(self):
        self.reject(lambda d: d['scenes'][0]['evidenceIds'].append('micin'))

    def test_missing_kitami_supplement(self):
        self.reject(lambda d: d['rows'][1].pop('partial'))

    def test_duplicate_json_key(self):
        with self.assertRaises(ValueError):
            json.loads('{"id":1,"id":2}', object_pairs_hook=no_duplicate_keys)

    def test_no_reverification_claim(self):
        self.reject(lambda d: d['provenance'].update(originalSourcesRechecked=True))

    def test_build_and_http(self):
        legacy = ROOT / 'imported-dashboard/index.html'
        before = hashlib.sha256(legacy.read_bytes()).digest()
        subprocess.run(['python', str(ROOT / 'scripts/build.py')], check=True)
        self.assertEqual(before, hashlib.sha256(legacy.read_bytes()).digest())
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT / 'frontend/dist')))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}'
            for path in ('/', '/app.js', '/style.css', '/evidence.js', '/research.html', '/research.js', '/research.css', '/data/visits.json', '/data/precare.json', '/data/research.json', '/data/competitors.json', '/data/seminar.json', '/imported-dashboard/index.html'):
                with urllib.request.urlopen(base + path) as response:
                    self.assertEqual(response.status, 200)
                    body = response.read()
                    if path.endswith('.json'):
                        self.assertEqual(body, (ROOT / path.lstrip('/')).read_bytes())
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
