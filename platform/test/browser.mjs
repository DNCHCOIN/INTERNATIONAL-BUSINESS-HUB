import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {start} from '../src/server.mjs';
const require=createRequire(import.meta.url),pp=require(process.env.DNCH_PUPPETEER);
const file=process.env.DNCH_TEST_CONFIG;if(!file?.includes('qa-'))throw new Error('Disposable QA configuration required');
const config=JSON.parse(await fs.readFile(file,'utf8'));config.ports={hub:18903,trade:18901,caspian:18902};const app=await start(config);
const browser=await pp.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];let matrix=0;
const root=path.dirname(file);const suffix=randomBytes(5).toString('hex');
async function fill(page,selector,data){await page.$eval(selector,(f,b)=>{for(const [name,value] of Object.entries(b)){const node=f.querySelector(`[name="${name}"]`);if(node){if(node.type==='checkbox')node.checked=!!value;else node.value=String(value);}}},data);}
async function submit(page,selector){await page.click(selector+' button[type=submit]');await page.waitForFunction(()=>!document.body.dataset.saving,{timeout:15000});}
async function wait(page,selector){await page.waitForSelector(selector,{timeout:15000});}
try{
 for(const width of [1440,390])for(const lang of ['bg','en','zh'])for(const area of ['hub','trade','caspian']){
  const context=await browser.createBrowserContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width,height:1000});
  await page.goto(`http://127.0.0.1:${config.ports[area]}/?lang=${lang}`,{waitUntil:'networkidle0'});await wait(page,'#content h1');
  assert.equal(await page.$eval('html',e=>e.lang),lang);assert.equal(await page.$eval('#language',e=>e.value),lang);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${area}/${lang}/${width} overflow`);
  if(area==='hub' && lang==='bg' && width===1440)await page.screenshot({path:path.join(root,'hub-desktop.png'),fullPage:true});
  if(area==='caspian' && lang==='zh' && width===390)await page.screenshot({path:path.join(root,'caspian-mobile-zh.png'),fullPage:true});
  matrix++;await context.close();
 }
 const context=await browser.createBrowserContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.setViewport({width:1440,height:1000});
 await page.goto(`http://127.0.0.1:${config.ports.hub}/?lang=bg`,{waitUntil:'networkidle0'});await page.click('[data-mode=register]');await wait(page,'form[data-form=register]');
 const email=`browser-${suffix}@example.invalid`,password=randomBytes(24).toString('base64url');
 const registration={name_native:'Синтетична браузърна фирма',name_latin:'Synthetic browser company '+suffix,country:'BG',registration_number:String(910000000+parseInt(suffix.slice(0,5),16)),legal_form:'EOOD',city:'Plovdiv',postal_code:'4000',street:'Synthetic Test Address',contact_name:'Synthetic Browser Owner',position:'Owner',contact_email:email,phone:'+359000000000',sector:'Technology',activity:'Manufacturer',employees:'1-5',description:'Synthetic company for browser acceptance tests only',chamber_bg:'false',chamber_cn:'false',email,password,accept_terms:true};
 await fill(page,'form[data-form=register]',registration);
 await page.select('#language','zh');await wait(page,'form[data-form=register]');assert.equal(await page.$eval('[name=email]',e=>e.value),email);assert.equal(await page.$eval('[name=name_native]',e=>e.value),registration.name_native);
 await submit(page,'form[data-form=register]');await wait(page,'.metrics');
 await page.click('[data-nav=profile]');await wait(page,'form[data-form=profile]');assert.equal(await page.$eval('[name=name_latin]',e=>e.value),registration.name_latin);
 await page.goto(`http://127.0.0.1:${config.ports.trade}/?lang=en`,{waitUntil:'networkidle0'});await wait(page,'.metrics');await page.click('[data-nav=mine]');await wait(page,'[data-action=new-listing]');await page.click('[data-action=new-listing]');await wait(page,'form[data-form=listing]');
 await fill(page,'form[data-form=listing]',{title:'Synthetic browser product',description:'A synthetic trade listing created through the browser',sector:'Technology',region:'Plovdiv',expires_on:'2027-12-31'});await submit(page,'form[data-form=listing]');await wait(page,'[data-action=edit-listing]');
 await page.click('[data-action=edit-listing]');await fill(page,'form[data-form=listing]',{title:'Synthetic browser product edited'});await submit(page,'form[data-form=listing]');await page.waitForFunction(()=>document.querySelector('#content')?.textContent.includes('Synthetic browser product edited'));
 await page.reload({waitUntil:'networkidle0'});await page.click('[data-nav=mine]');await page.waitForFunction(()=>document.querySelector('#content')?.textContent.includes('Synthetic browser product edited'));
 await page.click('[data-action=remove-listing]');await wait(page,'#content .empty');
 await page.goto(`http://127.0.0.1:${config.ports.caspian}/?lang=en`,{waitUntil:'networkidle0'});await wait(page,'.metrics');await page.click('[data-nav=cargo]');await wait(page,'[data-action=new-cargo]');await page.click('[data-action=new-cargo]');
 await fill(page,'form[data-form=cargo]',{reference:'BROWSER-'+suffix,description:'Synthetic browser multimodal cargo'});await submit(page,'form[data-form=cargo]');await wait(page,'[data-action=cargo-routes]');await page.click('[data-action=cargo-routes]');await wait(page,'form[data-form=route]');await submit(page,'form[data-form=route]');await wait(page,'[data-action=plan-shipment]');assert.ok((await page.$$('[data-action=plan-shipment]')).length>=3);
 await page.screenshot({path:path.join(root,'caspian-routes-desktop.png'),fullPage:true});
 await page.click('[data-action=plan-shipment]');await fill(page,'form[data-form=shipment]',{reference:'BROWSER-SHIP-'+suffix});await submit(page,'form[data-form=shipment]');await wait(page,'[data-action=new-event]');await page.click('[data-action=new-event]');await wait(page,'form[data-form=event]');await fill(page,'form[data-form=event]',{location_name:'Synthetic Poti',event_type:'terminal_in',transport_mode:'terminal'});await submit(page,'form[data-form=event]');await wait(page,'[data-action=tracking]');await page.click('[data-action=tracking]');await wait(page,'#detail .timeline li');
 assert.ok(await page.$eval('#detail-content',e=>e.textContent.includes('Synthetic Poti')));await page.click('#close-detail');
 await page.click('[data-nav=documents]');await wait(page,'form[data-form=document]');const pdf=path.join(root,'synthetic-browser-invoice.pdf');await fs.writeFile(pdf,'%PDF-1.4\nSynthetic browser upload\n%%EOF');await page.$eval('[name=kind]',e=>e.value='invoice');const upload=await page.$('input[type=file]');await upload.uploadFile(pdf);await submit(page,'form[data-form=document]');await page.waitForFunction(()=>document.querySelector('#content')?.textContent.includes('synthetic-browser-invoice.pdf'));
 await page.setViewport({width:390,height:1000});for(const n of ['cargo','routes','matching','shipments','documents','warehouses','integrations']){await page.click(`[data-nav=${n}]`);await wait(page,'#content h1');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,n+' authenticated mobile overflow');}
 assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({result:'PASS',anonymous_language_viewport_cases:matrix,authenticated_business_flow:'registration → shared login → trade CRUD → cargo → routes → shipment → event → private document',authenticated_mobile_views:7,page_errors:errors.length}));
}finally{await browser.close();await app.close();}
