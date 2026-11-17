"""Build a static prototype; the served JSON is always copied from data/."""
import shutil
from validate_visits import ROOT, load, validate
from validate_research import validate_research

validate(load())
validate_research()
out = ROOT / 'frontend/dist'
out.mkdir(exist_ok=True)
for name in ('index.html', 'app.js', 'style.css', 'evidence.js', 'research.html', 'research.js', 'research.css'):
    shutil.copyfile(ROOT / 'frontend' / name, out / name)
(out / 'data').mkdir(exist_ok=True)
for name in ('visits', 'precare', 'research', 'competitors', 'seminar'):
    shutil.copyfile(ROOT / f'data/{name}.json', out / f'data/{name}.json')
    assert (out / f'data/{name}.json').read_bytes() == (ROOT / f'data/{name}.json').read_bytes()
print('PASS: static build → frontend/dist; served JSON matches canonical bytes')

(out / 'imported-dashboard').mkdir(exist_ok=True)
shutil.copyfile(ROOT / 'imported-dashboard/index.html', out / 'imported-dashboard/index.html')
