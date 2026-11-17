// Interaction and link regression checks with a DOM stub, not a browser.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const r = JSON.parse(read('data/research.json'));
const visits = JSON.parse(read('data/visits.json'));
const precare = JSON.parse(read('data/precare.json'));
const competitors = JSON.parse(read('data/competitors.json'));
const seminar = JSON.parse(read('data/seminar.json')); 
const element = () => ({innerHTML:'', open:false, focus(){ this.focused = true; }, setAttribute(){}, addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return element(); }, showModal(){ this.open = true; }, close(){ this.open = false; }});
const main = element(), modal = element(), detail = element(), toggle = element(), meansTarget = element();
meansTarget.scrollIntoView = () => { meansTarget.scrolled = true; };
main.querySelectorAll = () => main.details || [];
main.querySelector = selector => selector==='#unplaced'?main.details.find(d=>d.id==='unplaced'):element();
let rendered = '';
Object.defineProperty(main, 'innerHTML', {
  get(){ return rendered; },
  set(html){ rendered = html; main.details = [...html.matchAll(/<details[^>]*id="([^"]+)"[^>]*>/g)].map(m => ({id:m[1],open:/\sopen(?:\s|>)/.test(m[0])})); }
});
const listeners = {};
const document = {getElementById:id=>id==='means'?meansTarget:null,documentElement:{}, querySelector:s=>({'main':main,'dialog':modal,'#detail':detail,'#language':toggle}[s]), addEventListener:(name, fn)=>{ listeners[name] = fn; }};
const context = vm.createContext({document, URLSearchParams, location:{hash:'',search:''}, fetch:()=>new Promise(()=>{})});
for (const name of ['evidence.js','research.js']) vm.runInContext(read(`frontend/${name}`), context);
context.inputs = {r,visits,precare,competitors,seminar};
vm.runInContext('research = inputs.r; competitors = inputs.competitors; datasets = {visits:inputs.visits,precare:inputs.precare,seminar:inputs.seminar}', context);
const click = button => listeners.click({target:{closest:selector=>selector==='button'?button:null}});
const button = (id, dataset={}) => ({id,dataset,hasAttribute:name=>(name==='data-candidate' && Object.hasOwn(dataset,'candidate')) || (name==='data-options-example' && Object.hasOwn(dataset,'optionsExample')),isConnected:true,focus(){ this.focused=true; }});

for (const language of ['ja','en']) {
  context.inputLanguage=language;
  vm.runInContext('lang=inputLanguage; activeCandidate=null; renderResearch()',context);
  assert(!main.innerHTML.includes('undefined'));
  assert.equal((main.innerHTML.match(/data-overview=/g)||[]).length,7);
  assert(!main.innerHTML.includes('<table class="support-table'));
  const overview=main.innerHTML.match(/<table class="problem-overview">[\s\S]*?<\/table>/)[0];
  assert.equal((overview.match(/<th scope="col">/g)||[]).length,4);
  assert.deepEqual([...overview.matchAll(/data-overview="([^"]+)"/g)].map(m=>m[1]),r.candidates.map(c=>c.id),'Unfiltered original order');
  assert(!overview.includes('aria-expanded="true"'));
  assert(!main.details.find(d=>d.id==='coverage').open,'Evidence distribution starts collapsed');
  const distribution=vm.runInContext('coverage()',context);
  assert.equal((distribution.match(/data-cell=/g)||[]).length,9);
  for(const row of [...visits.rows,...precare.rows,...seminar.rows])assert(!distribution.includes(row.problem[language]),'Distribution must not repeat source prose');
  for(const c of r.candidates){
    assert(overview.includes(c.overview.title[language]));
    assert(overview.includes(c.overview.impact[language]));
    assert(overview.includes(c.overview.scale[language]));
    const row=overview.match(new RegExp(`<tr data-overview="${c.id}"[\\s\\S]*?<\\/tr>`))[0];
    assert.equal((row.match(/<td /g)||[]).length,3,'One row with three content cells');
    assert(row.includes('class="candidate-open"'),'Each row opens its own detail');
    assert(!overview.includes(c.cells.market.next[language]));
    click(button('',{candidate:c.id}));
    assert(main.innerHTML.includes(c.title[language]));
    const order=['tree','comparison','candidate-detail','observations','selected-evidence','means','solution-hypothesis','next-questions'].map(id=>main.innerHTML.indexOf(`id="${id}"`));
    assert(order.every((v,i)=>v>=0&&(!i||v>order[i-1])));
    for(const v of Object.values(c.cells)){
      assert(main.innerHTML.includes(v.known[language]));
      assert(main.innerHTML.includes(v.interpretation[language]));
      if(v!==c.cells.gap || !competitors.comparisons[c.id])assert(main.innerHTML.includes(v.unknown[language]));
      assert(main.innerHTML.includes(v.next[language]));
    }
    assert(main.innerHTML.includes('<table class="support-table'));
    assert(main.innerHTML.includes('id="means-candidate-title">'+c.overview.title[language]));
    if(competitors.comparisons[c.id]) {
      const config=competitors.comparisons[c.id];
      assert(main.innerHTML.includes(config.goal[language]));
      assert(main.innerHTML.includes(config.hypothesis[language]));
      assert(main.innerHTML.includes(config.unknown[language]));
      for(const row of vm.runInContext('comparisonRows()',context)) { assert(main.innerHTML.includes(row.coordination[language]));assert(main.innerHTML.includes('data-provision="'+row.provision.state+'"')); }
      const sourceUrls=vm.runInContext('serviceReferences().map(s=>s.url)',context);
      assert.equal(sourceUrls.length,new Set(sourceUrls).size);
    }
    for(const id of c.evidenceIds){
      assert.equal((main.innerHTML.match(new RegExp(`id="selected-evidence-${id}"`,'g'))||[]).length,1);
      const row=[...visits.rows,...precare.rows,...seminar.rows].find(v=>v.id===id);
      assert(main.innerHTML.includes(row.limit[language]));
    }
    const ids=[...main.innerHTML.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(ids.length,new Set(ids).size,'Duplicate IDs');
    for(const m of main.innerHTML.matchAll(/href="#([^"]+)"/g))assert(ids.includes(m[1]),`Broken anchor ${m[1]}`);
    click(button('language'));assert(main.innerHTML.includes('aria-expanded="true"'));click(button('language'));
  }
  click(button('',{candidate:'appointments'}));
  const table=main.innerHTML.match(/<table class="support-table appointment-axes">[\s\S]*?<\/table>/)[0];
  assert.equal((table.match(/<th scope="col">/g)||[]).length,6,'Name plus five axes');
  assert.equal((table.match(/<th scope="row">/g)||[]).length,6,'Two providers and four alternatives');
  for(const p of competitors.providers.slice(0,2)){assert(table.includes(p.price[language]));for(const l of p.links)assert(main.innerHTML.includes(l.url.replaceAll('&','&amp;')));}
  for(const a of r.alternatives){assert(table.includes(a.title[language]));for(const cell of Object.values(a.cells))assert(table.includes(cell[language]));}
  assert(table.includes('data-provider="alternative-2"'));
  assert(main.innerHTML.includes('id="supplementary-options"'));
  assert(!table.includes('data-provider="sunlife"'));
  assert(!main.innerHTML.includes('data-provision="pilot"'));
  assert.equal((main.innerHTML.match(/id="remaining-/g)||[]).length,1);
  for(const c of r.candidates)assert(main.innerHTML.includes(competitors.comparisons[c.id].remaining[language]));
  assert(main.innerHTML.includes(visits.rows.find(r=>r.id==='booked').followUp.account[language]));
  click(button('',{candidate:''}));assert(!main.innerHTML.includes('<table class="support-table'));
}
console.log('PASS: seven unranked candidates, four overview columns, collapsed distribution without source prose, adjacent selected detail, ordered evidence/options/hypothesis/checks, one same-candidate means chapter, six-option/five-axis appointment example, provision provenance, candidate-specific comparisons, unique evidence records, original fees/sources, JA/EN and anchors (DOM stub)');
