// Rendering checks with a minimal DOM stub. This is not a browser test.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/visits.json'), 'utf8'));
const element = () => ({innerHTML:'', textContent:'', open:false, querySelectorAll:()=>[], setAttribute(){}, focus(){}, addEventListener(){}, querySelector(){ return element(); }, showModal(){ this.open = true; }});
const main = element(), dialog = element(), detail = element(), toggle = element();
const nodes = {'main':main, 'dialog':dialog, '#detail':detail, '#language':toggle};
const context = vm.createContext({window:{addEventListener(){}},document:{querySelector:s=>nodes[s], documentElement:{}, addEventListener(){}}, URLSearchParams, location:{hash:'',search:''}, fetch:()=>new Promise(()=>{})});
vm.runInContext(fs.readFileSync(path.join(root, 'frontend/evidence.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'frontend/app.js'), 'utf8'), context);
context.input = data;
vm.runInContext('data = input', context);
for (const lang of ['ja','en']) {
  context.lang = lang;
  vm.runInContext('language = lang', context);
  for (const view of ['matrix','map']) {
    context.inputView = view;
    vm.runInContext('view = inputView; render()', context);
    assert(!main.innerHTML.includes('undefined'));
    for (const row of data.rows) {
      assert.equal(main.innerHTML.split(`data-evidence="${row.id}"`).length - 1, 1);
    }
    assert(main.innerHTML.includes(data.candidates[0].title[lang]));
  }
  for (const row of data.rows) {
    context.evidenceId = row.id;
    vm.runInContext('view = "matrix"; detail(evidenceId)', context);
    const matrixDetail = detail.innerHTML;
    vm.runInContext('view = "map"; detail(evidenceId)', context);
    assert.equal(matrixDetail, detail.innerHTML);
    assert(detail.innerHTML.includes(row.scope[lang]));
    assert(detail.innerHTML.includes(row.limit[lang]));
    for (const id of row.sources) assert(detail.innerHTML.includes(data.sources[id].url.replaceAll('&','&amp;')));
    if (row.partial) assert(detail.innerHTML.includes(row.partial.limit[lang]));
  }
}
assert.equal(vm.runInContext('esc("<script>&")', context), '&lt;script&gt;&amp;');
const matrixTarget = {scrollIntoView(){ this.scrolled = true; }};
context.document.getElementById = id => id === 'n14-visits-table' ? matrixTarget : null;
context.location.hash = '#n14-visits-table';
vm.runInContext('followEvidenceHash()', context);
assert(matrixTarget.scrolled);
context.location.hash = '#n14-row-booked';
vm.runInContext('followEvidenceHash()', context);
assert(dialog.open);
assert(detail.innerHTML.includes(data.rows.find(r=>r.id==='booked').scope.en));
console.log('PASS: both languages × both views; all evidence cards; shared details; sources and Kitami supplement; HTML escaping (DOM stub, not browser QA)');
