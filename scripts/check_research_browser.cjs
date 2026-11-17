// Real Chromium checks; build first. Requires Playwright without changing repo dependencies.
// NODE_PATH=/tmp/ageing-browser/node_modules PLAYWRIGHT_BROWSERS_PATH=/tmp/ageing-browser/browsers node scripts/check_research_browser.cjs
const {chromium} = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../frontend/dist');
const screenshots = path.resolve(process.env.SCREENSHOT_DIR || path.join(__dirname,'../artifacts/research-options'));
const research = JSON.parse(fs.readFileSync(path.join(root, 'data/research.json')));
const providers = JSON.parse(fs.readFileSync(path.join(root, 'data/competitors.json')));
const server = http.createServer((req,res)=>{
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if(!file.startsWith(root + path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,body)=>{
    if(err){res.writeHead(404).end();return;}
    const type = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)];
    res.writeHead(200,{'Content-Type':type||'application/octet-stream'}).end(body);
  });
});
(async()=>{
  let browser;
  try{
    fs.mkdirSync(screenshots,{recursive:true});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({headless:true});
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
      for(const language of ['ja','en']){
        const page=await browser.newPage({viewport});
        const errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
        await page.goto(`http://127.0.0.1:${server.address().port}/research.html?lang=${language}`);
        await page.locator('.problem-overview').waitFor();
        // Introduction and tree remain unselected until a difficulty is chosen.
        assert.equal(await page.locator('.problem-branch [aria-pressed="true"]').count(),0);
        assert.equal(await page.locator('.candidate-open[aria-expanded="true"]').count(),0);
        assert.equal(await page.locator('.tree-major').count(),2);
        assert.equal(await page.locator('.tree-middle').count(),4);
        assert.equal(await page.locator('.tree-scenes button').count(),7);
        assert.equal(await page.locator('.tree-illustration-slot').count(),4);
        assert.equal(await page.locator('#tree svg path').count(),6);
        assert.equal(await page.locator('#tree img').count(),0);
        assert(await page.locator('.research-opening').evaluate(e=>e.nextElementSibling.id==='tree'));
        assert(await page.locator('#tree').evaluate(e=>e.nextElementSibling.id==='comparison'));
        if(viewport.width<761){
          const majors=await page.locator('.tree-major').evaluateAll(els=>els.map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})));
          assert(majors[1].top>=majors[0].bottom,'Major branches stack on mobile');
          const font=await page.locator('.tree-scenes button').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
          assert(font>=16,'Do not shrink the difficulty text');
          assert(await page.locator('#tree').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Tree must fit mobile width');
        }else{
          // The split connector ends align with the two headings below it.
          const fork=await page.locator('.tree-root-join').boundingBox();
          const majors=await page.locator('.tree-major-heading').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,top:r.top};}));
          for(const [i,m] of majors.entries())assert(Math.abs(m.x-(fork.x+fork.width*(i?0.75:0.25)))<2,'Root branches align with category centers');
        }
        await page.locator('.research-opening').screenshot({path:path.join(screenshots,`opening-${language}-${viewport.width}.png`)});
        await page.locator('#tree').screenshot({path:path.join(screenshots,`problem-tree-${language}-${viewport.width}.png`)});

        assert.equal(await page.locator('.problem-overview tbody tr').count(),7);
        assert.equal(await page.locator('.problem-overview thead th').count(),4);
        assert.equal(await page.locator('.support-table').count(),0);
        assert.equal(await page.locator('#coverage > summary').innerText(),language==='ja'?'根拠の分布を見る':'View the evidence distribution');
        assert.equal(await page.locator('#coverage').evaluate(e=>e.open),false);
        assert.deepEqual(await page.locator('[data-overview]').evaluateAll(els=>els.map(e=>e.dataset.overview)),research.candidates.map(c=>c.id));
        for(const c of research.candidates){
          const row=page.locator(`[data-overview="${c.id}"]`);
          assert.equal(await row.locator('td').count(),3);
          assert((await row.innerText()).includes(c.overview.impact[language]));
          assert((await row.innerText()).includes(c.overview.scale[language]));
          assert.equal(await row.locator('td:last-child .candidate-open').count(),1);
        }

        assert(await page.locator('#comparison').evaluate(e=>e.nextElementSibling.id==='candidate-detail'));
        await page.locator('#comparison').screenshot({path:path.join(screenshots,`problem-overview-${language}-${viewport.width}.png`)});
        await page.locator('#comparison').screenshot({path:path.join(screenshots,`overview-${language}-${viewport.width}.png`)});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Initial page overflow');
        if(viewport.width<761){
          await page.locator('.problem-overview-scroll').evaluate(e=>{e.scrollLeft=e.scrollWidth;});
          await page.locator('#comparison').screenshot({path:path.join(screenshots,`overview-details-${language}-${viewport.width}.png`)});
          await page.locator('.problem-overview-scroll').evaluate(e=>{e.scrollLeft=0;});
        }

        for(const c of research.candidates){
          const button=page.locator(`.candidate-open[data-candidate="${c.id}"]`);
          await button.click();
          assert.equal(await button.getAttribute('aria-expanded'),'true');
          assert.equal(await page.locator('#candidate-detail-title').innerText(),c.overview.title[language]);
          assert(await page.locator('#candidate-detail').evaluate(e=>document.activeElement===e));
          const headings=await page.locator('#candidate-detail > section > h3').allTextContents();
          assert.equal(headings.length,1);
          await page.locator('#candidate-detail .detail-means-link a').click();
          assert(await page.locator('#means').evaluate(e=>document.activeElement===e));
          assert.equal(await page.locator('#means-candidate-title').innerText(),c.overview.title[language]);
          assert.equal(await page.locator('#means').count(),1);
          assert.equal(await page.locator('#providers').getAttribute('data-comparison'),c.id);
          assert.equal(await page.locator('table.support-table').count(),1,'No duplicate comparison tables');
          if(!await page.locator('#next-stage').evaluate(e=>e.open))await page.locator('#next-stage > summary').click();
          assert.equal(await page.locator('.support-table').count(),providers.comparisons[c.id]?1:0);
          for(const [key,axis] of Object.entries(c.cells)){
            const unknown=key==='gap'&&providers.comparisons[c.id]?providers.comparisons[c.id].unknown[language]:axis.unknown[language];
            assert((await page.locator('#next-questions').innerText()).includes(unknown));
            assert((await page.locator('#next-questions').innerText()).includes(axis.next[language]));
          }
          const records=await page.locator('#selected-evidence .evidence-record').evaluateAll(els=>els.map(e=>e.id.replace('selected-evidence-','')));
          assert.deepEqual(new Set(records),new Set(c.evidenceIds));
          assert.equal(records.length,new Set(records).size);
          for(const id of c.evidenceIds){
            await page.locator(`#candidate-detail .evidence-link[href="#selected-evidence-${id}"]`).first().click();
            assert(await page.locator(`#source-record-${id}`).evaluate(e=>e.open));
            assert(await page.locator(`#selected-evidence-${id}`).isVisible());
            assert(await page.locator(`#source-record-${id} a[target="_blank"]`).count()>0);
          }
          if(providers.comparisons[c.id]){
            assert((await page.locator('.comparison-goal').innerText()).includes(providers.comparisons[c.id].goal[language]));
            assert((await page.locator('#solution-hypothesis').innerText()).includes(providers.comparisons[c.id].hypothesis[language]));
            assert.equal(await page.locator('.support-table thead th').count(),c.id==='appointments'?6:5);
            assert.equal(await page.locator('.support-table tbody tr').count(),providers.comparisons[c.id].optionIds.length);
            const links=await page.locator('.support-table .service-source-link').evaluateAll(els=>els.map(e=>e.getAttribute('href')));
            for(const href of new Set(links)){
              await page.locator(`.support-table a[href="${href}"]`).first().click();
              assert(await page.locator(href).isVisible());
              assert.equal(await page.locator(`${href} a[target="_blank"]`).count(),1);
            }
            const urls=await page.locator('.service-source-record a[target="_blank"]').evaluateAll(els=>els.map(e=>e.href));
            assert.equal(urls.length,new Set(urls).size);
          }
          for(const row of await page.locator('#providers > .support-table-scroll tbody tr').all()){
            assert.equal(await row.locator('[data-provision]').count(),1);
          }
          assert.equal(await page.locator('[data-provision="pilot"]').count(),0);
          assert.equal(await page.locator('#remaining-work dl > div').count(),7);
          if(c.id==='implementation'){
            assert.equal(await page.locator('[data-provider="productivity-center"] [data-provision="unresearched"]').count(),1);
            assert((await page.locator('[data-provider="productivity-center"] .provision-state').innerText()).includes(language==='ja'?'未記録':'Unrecorded'));
            await page.locator('#means').screenshot({path:path.join(screenshots,`implementation-options-${language}-${viewport.width}.png`)});
          }
          await page.locator(`#assessment-${c.id} summary`).click();
          await page.locator('#language').click();
          assert.equal(await button.getAttribute('aria-expanded'),'true');
          assert(await page.locator(`#assessment-${c.id}`).evaluate(e=>e.open));
          await page.locator('#language').click();
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow');
          const ids=await page.locator('[id]').evaluateAll(els=>els.map(e=>e.id));
          assert.equal(ids.length,new Set(ids).size,'Duplicate DOM IDs');
          // Every tree branch reaches the same selected detail, including keyboard activation.
          const treeButton=page.locator(`.problem-branch [data-candidate="${c.id}"]`);
          await treeButton.focus();await treeButton.press('Enter');
          assert.equal(await treeButton.getAttribute('aria-pressed'),'true');
          assert(await page.locator('#candidate-detail').evaluate(e=>document.activeElement===e));
        }
        await page.locator('.candidate-open[data-candidate="appointments"]').click();
        assert.equal(await page.locator('.observed-case ol li').count(),3);
        assert.equal(await page.locator('.support-table thead th').count(),6);
        assert((await page.locator('.support-table caption').boundingBox()).height<150,'Caption should read horizontally on mobile');
        assert.equal(await page.locator('.support-table tbody tr').count(),6);
        for(const p of providers.providers.slice(0,2)){
          const row=page.locator(`[data-provider="${p.id}"]`);
          assert((await row.innerText()).includes(p.priceExample[language]));
          assert((await row.innerText()).includes(p.coordination[language]));
          await row.locator('.fee-breakdown summary').click();
          assert((await row.innerText()).includes(p.price[language]));
          await row.locator('.fee-breakdown summary').click();
          for(const l of p.links)assert.equal(await page.locator(`.service-source-record a[href="${l.url}"]`).count(),1);
        }
        assert((await page.locator('[data-provider="odekake"]').innerText()).includes('17,800'));
        assert.equal(await page.locator('.support-table [data-provider^="alternative-"]').count(),4);
        assert.equal(await page.locator('#supplementary-options').count(),1);
        assert.equal(await page.locator('.support-table [data-provider="sunlife"]').count(),0);
        await page.locator('.case-boundary .evidence-link').click();
        assert.equal(await page.locator('#selected-evidence-booked a[href="https://kaigo-postseven.com/124470"]').count(),1);
        await page.locator('#selected-evidence').evaluate(e=>e.open=false);
        await page.locator('#observations').screenshot({path:path.join(screenshots,`integrated-case-${language}-${viewport.width}.png`)});
        await page.locator('#means').screenshot({path:path.join(screenshots,`integrated-support-${language}-${viewport.width}.png`)});
        await page.locator('#next-questions').screenshot({path:path.join(screenshots,`integrated-next-${language}-${viewport.width}.png`)});
        await page.locator('.candidate-open[data-candidate="discharge"]').click();
        assert.equal(await page.locator('[data-comparison="discharge"]').count(),1);
        assert.equal(await page.locator('[data-provider="nanairo"]').count(),0);
        for(const id of ['hospital-discharge','cm-discharge','duskin-discharge','omohibito-discharge'])assert.equal(await page.locator(`[data-provider="${id}"]`).count(),1);
        await page.locator('#means').screenshot({path:path.join(screenshots,`discharge-support-${language}-${viewport.width}.png`)});
        if(!await page.locator('#next-stage').evaluate(e=>e.open))await page.locator('#next-stage > summary').click();
        await page.locator('#solution-hypothesis').screenshot({path:path.join(screenshots,`discharge-hypothesis-${language}-${viewport.width}.png`)});
        await page.locator('.candidate-open[data-candidate="appointments"]').click();
        assert.equal(await page.locator('[data-provider="hospital-discharge"]').count(),0);

        // Keep the background landscape and original evidence dialog usable.
        await page.locator('#coverage > summary').click();
        assert.equal(await page.locator('#coverage [data-cell]').count(),9);
        await page.locator('#coverage').screenshot({path:path.join(screenshots,`evidence-distribution-${language}-${viewport.width}.png`)});
        await page.locator('#coverage [data-evidence="booked"]').first().click();
        assert(await page.locator('dialog').isVisible());
        await page.keyboard.press('Escape');
        await page.locator('#candidate-detail [data-candidate=""]').click();
        assert.equal(await page.locator('.support-table').count(),0);
        assert.equal(await page.locator('.candidate-open[aria-expanded="true"]').count(),0);
        assert.deepEqual(errors,[]);
        await page.close();
        console.log(`PASS: Chromium ${viewport.width}px ${language}; seven compact candidates, adjacent details, four ordered sections, seven task comparisons, same-name means links, provision provenance, discharge switching and deduplicated sources, tree/keyboard/language flows`);
      }
    }
    console.log(`Screenshots: ${screenshots}`);
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
