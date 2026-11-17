'use strict';
let data;
let language = new URLSearchParams(location.search || '').get('lang') === 'en' ? 'en' : 'ja';
let view = 'matrix';
let activeEvidence = null;
let returnEvidence = null;
const main = document.querySelector('main');
const dialog = document.querySelector('dialog');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t = value => esc(value[language]);
const say = (ja, en) => esc(language === 'ja' ? ja : en);
const rowById = id => data.rows.find(row => row.id === id);
const kind = row => row.kind === 'case' ? say('個別事例', 'Individual case') : say('調査', 'Survey');
const badge = row => `<span class="badge ${row.kind}">${kind(row)}</span><span class="badge">${row.status === 'partial' ? say('限定的な根拠','Limited evidence') : say('資料内の観察','Observation in source')}</span>`;

function evidenceButton(id, map = false) {
  const row = rowById(id);
  return `<button id="n14-row-${esc(id)}" class="evidence ${map ? 'map-node' : ''}" data-evidence="${esc(id)}" aria-haspopup="dialog">${badge(row)}<strong>${t(row.problem)}</strong><span>${t(row.result)}</span><small>${say('出典・対象・分母・限界を開く','Open sources, population, denominator & limitations')} ↗</small></button>`;
}

function matrix() {
  return `<div class="matrix-scroll" id="n14-visits-table"><table><caption class="sr-only">${say('場面ごとのProblem Matrix','Problem Matrix by setting')}</caption><thead><tr><th scope="col">${say('場面','Setting')}</th><th scope="col">${say('確認できたこと','What is observed')}</th><th scope="col">${say('まだ分からないこと','What remains unknown')}</th><th scope="col">${say('次に調べること','What to investigate next')}</th></tr></thead><tbody>${data.scenes.map((s, i) => `<tr><th scope="row"><span class="number">0${i + 1}</span>${t(s.title)}</th><td>${s.evidenceIds.map(id => evidenceButton(id)).join('')}</td><td><span class="badge unknown">${say('未確認','Unknown')}</span><p>${t(s.unknown)}</p></td><td><span class="badge next">${say('調査案','Proposed research')}</span><p>${t(s.next)}</p></td></tr>`).join('')}</tbody></table></div>`;
}

function mindmap() {
  return `<div class="mindmap"><div class="map-root">${t(data.topic.title)}<span>${say('3つの場面から根拠をたどる','Explore evidence through three settings')}</span></div><div class="map-branches">${data.scenes.map((s, i) => `<section class="map-branch"><h3><span class="number">0${i + 1}</span>${t(s.title)}</h3><div class="map-leaves">${s.evidenceIds.map(id => evidenceButton(id, true)).join('')}</div><details class="map-question"><summary>${say('未確認事項と次の調査','Unknowns & next research')}</summary><h4>${say('まだ分からないこと','What remains unknown')}</h4><p>${t(s.unknown)}</p><h4>${say('次に調べること','What to investigate next')}</h4><p>${t(s.next)}</p></details></section>`).join('')}</div></div>`;
}

function idea() {
  const c = data.candidates[0];
  return `<section class="idea" id="n14-idea-${esc(c.id)}"><div><span class="badge hypothesis">${say('未検証の事業案','Untested business idea')}</span><h2>${t(c.title)}</h2><p>${t(c.focus)}</p></div><div><p class="idea-note">${say('画面試作に使った一例で、研究課題としては未選定です。観察された課題から、需要・利用・支払い・効果が立証されたわけではありません。','A prototype example; not a selected research priority. Observed problems do not establish demand, use, payment or effectiveness.')}</p><ul>${c.questions.map(q => `<li>${t(q)}</li>`).join('')}</ul><p class="legacy">${t(c.link[1])} · ${c.nodes.map(esc).join(' / ')}<br>${say('比較用HTMLにある既存仮説への参照ID','Reference IDs for hypotheses in the comparison dashboard')}</p></div></section>`;
}

function render() {
  const opened = [...main.querySelectorAll('details')].map((el, i) => el.open ? i : -1);
  document.documentElement.lang = language;
  document.title = `${data.topic.title[language]} | Evidence explorer`;
  const toggle = document.querySelector('#language');
  toggle.textContent = language === 'ja' ? 'English' : '日本語';
  toggle.lang = language === 'ja' ? 'en' : 'ja';
  toggle.setAttribute('aria-label', language === 'ja' ? 'Switch to English' : '日本語に切り替える');
  main.innerHTML = `<nav class="research-back"><a href="research.html?lang=${language}">${say('調べた範囲と深掘り候補へ','Research landscape & candidate questions')} →</a></nav><section class="intro"><p class="eyebrow">FIELD NOTES / MEDICAL APPOINTMENTS</p><h1>${t(data.topic.title)}</h1><p class="lead">${t(data.topic.scene)}</p><div class="meta"><span>${say('根拠 5件','5 evidence records')}</span><span>${say('出典 8件','8 sources')}</span><span>${say('事業案 1件・未検証','1 untested idea')}</span></div><p class="notice">${say('既存HTMLからの移行試作。原典の再確認は行っていません。根拠データの日付：','Prototype migrated from the legacy HTML. Original sources have not been rechecked. Evidence data dated: ')}${esc(data.asOf)}<br>${say('日時が区別されていない資料は「全般」に置いています。「次に調べること」は試作用の調査提案です。','Evidence without a timing distinction stays in “overall”. Next research steps are proposals for this prototype.')}</p></section><section aria-labelledby="explorer-title"><div class="section-head"><div><p class="eyebrow">EVIDENCE EXPLORER</p><h2 id="explorer-title">${say('場面から、根拠と空白を見る','Explore evidence and gaps by setting')}</h2></div><div class="view-switch" role="group" aria-label="${say('表示形式','View')}"><button data-view="matrix" aria-pressed="${view === 'matrix'}">Problem Matrix</button><button data-view="map" aria-pressed="${view === 'map'}">${say('マインドマップ','Mind map')}</button></div></div><p class="hint">${say('各カードをクリックすると、同じ根拠詳細が開きます。調査の対象内での観察と、一般的な発生率を区別してください。','Select a card to open the shared evidence detail. Observations within a source’s population are distinct from general prevalence.')}</p><div id="n14-visits">${view === 'matrix' ? matrix() : mindmap()}</div></section>${idea()}<footer>${say('ローカル試作 · 観察／未確認事項／事業仮説を区別','Local prototype · Observations / unknowns / business hypotheses kept distinct')}</footer>`;
  main.querySelectorAll('details').forEach((el, i) => { el.open = opened.includes(i); });
}

function detail(id) {
  document.querySelector('#detail').innerHTML = evidenceDetail(rowById(id), data.sources, language);
}

function openEvidence(id, trigger) {
  if (!rowById(id)) return;
  activeEvidence = id;
  returnEvidence = trigger || null;
  detail(id);
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[data-close]').focus();
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !data) return;
  if (button.id === 'language') {
    language = language === 'ja' ? 'en' : 'ja';
    render();
    if (dialog.open) detail(activeEvidence);
  }
  if (button.dataset.view) {
    view = button.dataset.view;
    render();
    main.querySelector(`[data-view="${view}"]`).focus();
  }
  if (button.dataset.evidence) openEvidence(button.dataset.evidence, button);
  if (button.hasAttribute('data-close')) dialog.close();
});
dialog.addEventListener('close', () => {
  if (returnEvidence?.isConnected) returnEvidence.focus();
  activeEvidence = null;
});

function followEvidenceHash() {
  if (!data) return;
  const id = location.hash.replace(/^#n14-row-/, '');
  if (rowById(id)) openEvidence(id);
  else if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
window.addEventListener('hashchange', followEvidenceHash);

fetch('data/visits.json').then(response => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}).then(value => {
  data = value;
  render();
  followEvidenceHash();
}).catch(() => {
  main.innerHTML = '<h1>データを読み込めません / Unable to load data</h1><p>python scripts/build.py を実行し、frontend/dist をHTTPサーバーで開いてください。 / Build and serve frontend/dist over HTTP.</p>';
});
