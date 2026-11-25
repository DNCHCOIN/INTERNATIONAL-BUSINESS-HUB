// Runs only against an explicitly supplied disposable private-staging configuration.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {start} from '../src/server.mjs';
import {uuid,passwordHash} from '../src/common.mjs';
const file=process.env.DNCH_TEST_CONFIG;if(!file||!file.includes('qa-'))throw new Error('Disposable qa- configuration required');
const config=JSON.parse(await fs.readFile(file,'utf8'));config.ports={hub:18903,trade:18901,caspian:18902};
let app=await start(config),checks=0;const suffix=randomBytes(6).toString('hex'),password=randomBytes(24).toString('base64url');
class Agent{
 cookie='';csrf='';
 async call(area,url,method='GET',body,expected=200,extra={}){
  const origin=`http://127.0.0.1:${config.ports[area]}`;
  const res=await fetch(origin+url,{method,headers:{Origin:origin,'Content-Type':'application/json','X-DNCH-Request':'1','X-CSRF-Token':this.csrf,Cookie:this.cookie,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const cookie=res.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];
  const raw=await res.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}
  assert.equal(res.status,expected,`${area} ${method} ${url}: ${JSON.stringify(data)}`);checks++;
  if(url==='/api/auth/me')this.csrf=data.csrf;
  return data;
 }
 async register(n){const b=company(n);const r=await this.call('hub','/api/auth/register','POST',b,201);this.company=r.company_id;await this.call('hub','/api/auth/me');return r;}
}
function company(n){return {country:'BG',registration_number:String(900000000+Number.parseInt(suffix.slice(0,5),16)+n),name_native:`Синтетична фирма ${n}`,name_latin:`Synthetic QA ${suffix} ${n}`,legal_form:'EOOD',vat_number:'',city:'Plovdiv',postal_code:'4000',street:'Synthetic Test Street 1',contact_name:`Synthetic User ${n}`,position:'Owner',contact_email:`contact-${n}-${suffix}@example.invalid`,phone:'+359000000000',wechat:'synthetic',sector:'Technology',activity:'Manufacturer',languages:['bg','en','zh'],website:'',description:'Synthetic company for isolated integration tests only',partners:'Suppliers',employees:'1-5',experience:'Synthetic',chamber_bg:false,chamber_cn:false,email:`owner-${n}-${suffix}@example.invalid`,password,accept_terms:true,system_role:'administrator',status:'verified'};}
const anon=new Agent(),a=new Agent(),b=new Agent(),admin=new Agent(),viewer=new Agent();
const nextYear=new Date(Date.now()+365*86400000).toISOString().slice(0,10),today=new Date().toISOString().slice(0,10);
const listing={title:'Synthetic solar panels',direction:'offer',partnership:'export',description:'Synthetic product specification for integration testing',sector:'Technology',country:'BG',region:'Plovdiv',language:'en',expires_on:nextYear,status:'draft',price_min:100,price_max:200,currency:'EUR',incoterms:'EXW'};
const cargo={reference:`QA-${suffix}`,origin_name:'Plovdiv',destination_name:'Almaty',weight_kg:6000,volume_m3:20,loading_m:3,pallets:6,pickup_date:today,description:'Synthetic machine components',synthetic:true,temperature:'ambient',hazardous:false};
const pdf=Buffer.from('%PDF-1.4\nSynthetic QA registration evidence only\n%%EOF');
const adminId=uuid();
async function verify(agent){
 const d=await agent.call('hub','/api/documents','POST',{kind:'registration',name:'synthetic-registration.pdf',content_base64:pdf.toString('base64')},201);
 await b.call('hub','/api/documents/'+d.id,'GET',undefined,404);
 const raw=await admin.call('hub','/api/documents/'+d.id);assert.ok(raw.startsWith('%PDF-'));
 await admin.call('hub',`/api/documents/${d.id}/review`,'POST',{status:'reviewed',note:'Synthetic document reviewed for test scenario only'});
 const comp=await agent.call('hub','/api/company');
 await admin.call('hub',`/api/admin/companies/${agent.company}/review`,'POST',{status:'verified',note:'Synthetic company approved for isolated QA, no real registry verification',version:comp.version});
 await agent.call('hub','/api/auth/me');return d;
}
try{
 await anon.call('caspian','/api/caspian/cargo','GET',undefined,401);
 await anon.call('hub','/api/auth/login','POST',{email:'x@example.invalid',password},403,{Origin:'https://untrusted.invalid'});
 await a.register(1);await b.register(2);
 const me=await a.call('trade','/api/auth/me');assert.equal(me.user.system_role,'company');assert.equal(me.user.company_status,'pending');assert.equal('password_hash' in me.user,false);
 await a.call('trade','/api/trade/listings','POST',{...listing,status:'published'},403);
 const draft=await a.call('trade','/api/trade/listings','POST',listing,201);
 await a.call('hub','/api/company','PUT',{...company(1),version:1},403,{'X-CSRF-Token':'invalid'});
 await a.call('hub','/api/admin/companies','GET',undefined,403);
 await app.pools.identity.query("INSERT INTO identity.users(id,email,display_name,password_hash,system_role) VALUES($1,$2,'Synthetic test administrator',$3,'administrator')",[adminId,`admin-${suffix}@example.invalid`,await passwordHash(password)]);
 await admin.call('hub','/api/auth/login','POST',{email:`admin-${suffix}@example.invalid`,password});await admin.call('hub','/api/auth/me');
 await admin.call('hub',`/api/admin/companies/${a.company}/review`,'POST',{status:'verified',note:'This must be rejected without evidence',version:1},409);
 await a.call('hub','/api/documents','POST',{kind:'registration',name:'bad.pdf',content_base64:Buffer.from('<script>bad</script>').toString('base64')},422);
 const document=await verify(a);
 // Verification of B uses A for the negative ownership check, rather than B itself.
 const bd=await b.call('hub','/api/documents','POST',{kind:'registration',name:'b.pdf',content_base64:pdf.toString('base64')},201);
 await a.call('hub','/api/documents/'+bd.id,'GET',undefined,404);
 await admin.call('hub',`/api/documents/${bd.id}/review`,'POST',{status:'reviewed',note:'Synthetic document review for B only'});
 await admin.call('hub',`/api/admin/companies/${b.company}/review`,'POST',{status:'verified',note:'Synthetic company B approval for QA only',version:1});await b.call('hub','/api/auth/me');
 const own=(await a.call('trade','/api/trade/listings?mine=1')).items;assert.equal(own.length,1);
 await a.call('trade','/api/trade/listings/'+draft.id,'PUT',{...listing,status:'published',version:1});
 await b.call('trade','/api/trade/listings/'+draft.id,'PUT',{...listing,version:2},404);
 await a.call('trade','/api/trade/listings/'+draft.id,'PUT',{...listing,version:1},409);
 const publicList=await anon.call('trade','/api/trade/listings');assert.equal(publicList.visibility,'product_only');assert.ok(!JSON.stringify(publicList).includes('contact-'));assert.ok(!JSON.stringify(publicList).includes('+359'));assert.ok(!JSON.stringify(publicList).includes('company_id'));
 const registered=await b.call('trade','/api/trade/listings');assert.equal(registered.items[0].company.contact.phone,'+359000000000');
 const inj=await anon.call('trade','/api/trade/listings?q='+encodeURIComponent("' OR 1=1 --"));assert.equal(inj.items.length,0);
 const inquiry=await b.call('trade','/api/trade/inquiries','POST',{listing_id:draft.id,subject:'Synthetic supply request',message:'Synthetic request for commercial details'},201);
 await a.call('trade',`/api/trade/inquiries/${inquiry.id}/messages`,'POST',{message:'Synthetic response with availability'},201);
 assert.equal((await b.call('trade',`/api/trade/inquiries/${inquiry.id}`)).messages.length,1);
 const invite=await a.call('hub','/api/company/invitations','POST',{email:`viewer-${suffix}@example.invalid`,role:'viewer'},201);
 await viewer.call('hub','/api/auth/accept-invitation','POST',{email:`viewer-${suffix}@example.invalid`,password,display_name:'Synthetic viewer',invitation:invite.invitation},201);await viewer.call('hub','/api/auth/me');
 await viewer.call('trade','/api/trade/listings','POST',listing,403);
 await viewer.call('caspian','/api/caspian/cargo','POST',cargo,403);
 await viewer.call('hub','/api/company/invitations','POST',{email:'forbidden@example.invalid',role:'owner'},403);
 const cargoA=await a.call('caspian','/api/caspian/cargo','POST',cargo,201),cargoB=await a.call('caspian','/api/caspian/cargo','POST',{...cargo,reference:cargo.reference+'-B'},201);
 await a.call('caspian','/api/caspian/cargo','POST',{...cargo,reference:'invalid',synthetic:false},422);
 assert.equal((await b.call('caspian','/api/caspian/cargo')).items.length,0);
 await b.call('caspian','/api/caspian/routes','POST',{cargo_id:cargoA.id},404);
 const routes=await a.call('caspian','/api/caspian/routes','POST',{cargo_id:cargoA.id,scenario:'normal',objective:'balanced'});assert.ok(routes.items.length>=3);
 const matched=await a.call('caspian','/api/caspian/matching','POST',{cargo_ids:[cargoA.id,cargoB.id],commit:false});assert.equal(matched.groups.length,1);
 await a.call('caspian','/api/caspian/matching','POST',{cargo_ids:[cargoA.id,cargoB.id],commit:true});
 await a.call('caspian','/api/caspian/matching','POST',{cargo_ids:[cargoA.id],commit:true},409);
 const shipment=await a.call('caspian','/api/caspian/shipments','POST',{cargo_id:cargoA.id,route_id:routes.items[0].id,reference:'SHIP-'+suffix,scenario:'normal'},201);
 await b.call('caspian','/api/caspian/shipments/'+shipment.id,'GET',undefined,404);
 const event={source_event_id:'QA-EVENT-'+suffix,event_type:'delivered',location_name:'Synthetic Almaty',transport_mode:'road',observed_at:new Date(Date.now()-1000).toISOString(),note:'Synthetic delivery test'};
 await a.call('caspian',`/api/caspian/shipments/${shipment.id}/events`,'POST',event,201);
 const duplicate=await a.call('caspian',`/api/caspian/shipments/${shipment.id}/events`,'POST',event);assert.equal(duplicate.duplicate,true);
 await a.call('caspian',`/api/caspian/shipments/${shipment.id}/events`,'POST',{...event,note:'Changed payload'},409);
 await a.call('caspian',`/api/caspian/shipments/${shipment.id}/events`,'POST',{...event,source_event_id:event.source_event_id+'-old',event_type:'terminal_in',observed_at:new Date(Date.now()-3600000).toISOString()},201);
 const tracking=await a.call('caspian',`/api/caspian/shipments/${shipment.id}/export`);assert.equal(tracking.status,'delivered');assert.equal(tracking.events.length,2);assert.ok(tracking.events.every(e=>e.demo && !e.verified));
 const wh=await a.call('caspian','/api/caspian/warehouses','POST',{name:'Synthetic Poti hub',location:'Poti',capacity_m3:100,capacity_kg:10000,daily_eur:20},201);
 const reservation={warehouse_id:wh.id,shipment_id:shipment.id,volume_m3:60,weight_kg:1000,starts_on:today,ends_on:nextYear};
 const origin=`http://127.0.0.1:${config.ports.caspian}`;
 const simultaneous=await Promise.all([1,2].map(()=>fetch(origin+'/api/caspian/reservations',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-DNCH-Request':'1','X-CSRF-Token':a.csrf,Cookie:a.cookie},body:JSON.stringify(reservation)})));
 assert.deepEqual(simultaneous.map(r=>r.status).sort(),[201,409]);checks+=2;
 await b.call('caspian','/api/caspian/reservations','POST',reservation,404);
 const sd=await a.call('caspian','/api/documents','POST',{kind:'invoice',parent_id:shipment.id,name:'synthetic-invoice.pdf',content_base64:pdf.toString('base64')},201);
 await b.call('caspian','/api/documents/'+sd.id,'GET',undefined,404);
 const grants=await app.pools.trade.query('SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');assert.equal(grants.rows[0].rolsuper,false);assert.equal(grants.rows[0].rolbypassrls,false);
 const badPool=new pg.Pool({...config.databases.trade,database:config.databases.identity.database});try{await assert.rejects(badPool.query('SELECT 1'),e=>e.code==='42501');}finally{await badPool.end();}checks++;
 await assert.rejects(app.pools.identity.query('DELETE FROM identity.audit'),e=>e.code==='42501');checks++;
 const before=await a.call('hub','/api/company');await a.call('hub','/api/company','PUT',{...company(1),version:before.version,description:'Synthetic edited operational profile description'});await a.call('hub','/api/auth/me');assert.equal(a.csrf.length,43);const after=await a.call('hub','/api/company');assert.equal(after.status,'verified');
 await a.call('hub','/api/company','PUT',{...company(1),version:after.version,name_latin:'Changed synthetic legal name'});const recheck=await a.call('hub','/api/company');assert.equal(recheck.status,'pending');
 assert.equal((await anon.call('trade','/api/trade/listings')).items.length,0);
 await app.close();app=await start(config);assert.equal((await a.call('caspian','/api/caspian/shipments')).items.length,1);await a.call('hub','/api/documents/'+document.id);
 const who=await viewer.call('hub','/api/auth/me');await a.call('hub','/api/company/members/'+who.user.id,'PATCH',{role:'viewer',active:false});await viewer.call('trade','/api/trade/listings?mine=1','GET',undefined,401);
 await a.call('hub','/api/auth/logout','POST',{});await a.call('caspian','/api/caspian/shipments','GET',undefined,401);
 console.log(JSON.stringify({result:'PASS',http_and_security_checks:checks,coverage:['registration','persistent_shared_session','roles','tenant_isolation','verification','encrypted_documents','trade_lifecycle','inquiries','multimodal_routes','matching','tracking_idempotency','late_events','concurrent_capacity','database_roles','restart_persistence','logout']}));
}finally{await app.close();}
