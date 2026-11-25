import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {check,digest,fail,id,requireAdmin,requireCompany,str,transaction,uuid} from './common.mjs';
export function detectMime(buf){if(buf.subarray(0,5).toString()==='%PDF-')return 'application/pdf';if(buf[0]===255 && buf[1]===216 && buf[2]===255)return 'image/jpeg';return null;}
export async function documentRoutes(ctx){
 const match=ctx.url.pathname.match(/^\/api\/documents(?:\/([\w-]+)(?:\/(review))?)?$/);if(!match)return;
 const pool=ctx.area==='hub'?ctx.identity:ctx[ctx.area];
 const schema={hub:'identity',trade:'trade',caspian:'caspian'}[ctx.area];
 const table=`${schema}.documents`; // fixed application names, never request input
 const admin=ctx.user?.system_role==='administrator';const u=admin?requireAdmin(ctx):requireCompany(ctx);
 const run=fn=>transaction(pool,async c=>{await c.query("SELECT set_config('app.organization_id',$1,true),set_config('app.document_reviewer',$2,true),set_config('app.viewer_verified',$3,true)",[u.company_id||'',admin?'on':'off',u.company_status==='verified'?'on':'off']);return fn(c);});
 if(ctx.req.method==='GET' && !match[1]){
  const listing=ctx.area==='trade'?ctx.url.searchParams.get('listing_id'):null;
  const company=admin&&!listing?id(ctx.url.searchParams.get('company_id')):u.company_id;
  return run(async c=>{
   if(listing){const record=(await c.query('SELECT id,company_id,status FROM trade.listings WHERE id=$1',[id(listing)])).rows[0];check(record,'not_found',404);if(record.company_id!==u.company_id){requireCompany(ctx,null,true);const verified=(await ctx.identity.query("SELECT id FROM identity.companies WHERE id=$1 AND status='verified'",[record.company_id])).rowCount;check(verified,'not_found',404);}return {items:(await c.query(`SELECT id,company_id,kind,parent_id,name,mime,size,status,visibility,review_note,created_at FROM ${table} WHERE parent_id=$1 AND (company_id=$2 OR (visibility='registered' AND status='reviewed')) ORDER BY created_at DESC`,[listing,u.company_id])).rows};}
   return {items:(await c.query(`SELECT id,company_id,kind,parent_id,name,mime,size,status,visibility,review_note,created_at FROM ${table} WHERE company_id=$1 ORDER BY created_at DESC LIMIT 100`,[company])).rows};
  });
 }
 if(ctx.req.method==='POST' && !match[1]){
  requireCompany(ctx,ctx.area==='hub'?null:ctx.area);check(!admin,'company_required',403);
  check(u.role!=='viewer','role_denied',403);const b=ctx.body;
  const kinds=ctx.area==='hub'?['registration','certificate']:ctx.area==='trade'?['catalogue','certificate']:['invoice','packing_list','CMR','eCMR','TIR','eTIR','bill_of_lading','other'];check(kinds.includes(b.kind));
  const parent=ctx.area==='hub'?null:id(b.parent_id);const name=str(b.name,1,150);check(!/[\r\n\/\\]/.test(name));
  check(typeof b.content_base64==='string' && b.content_base64.length<=6990508 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b.content_base64),'file_invalid');
  const bytes=Buffer.from(b.content_base64,'base64');check(bytes.length>0 && bytes.length<=5242880,'file_size');const mime=detectMime(bytes);check(mime,'pdf_jpg_only');
  const docid=uuid(),key=`${ctx.area}-${docid}.bin`,iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',Buffer.from(ctx.config.document_key,'hex'),iv);
  const encrypted=Buffer.concat([iv,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);
  await fs.mkdir(ctx.config.documents,{recursive:true,mode:0o700});await fs.writeFile(path.join(ctx.config.documents,key),encrypted,{mode:0o600,flag:'wx'});
  try{await run(async c=>{
   if(parent){const parentTable=ctx.area==='trade'?'trade.listings':'caspian.shipments';const r=await c.query(`SELECT id FROM ${parentTable} WHERE id=$1 AND ${ctx.area==='trade'?'company_id':'organization_id'}=$2`,[parent,u.company_id]);check(r.rowCount,'parent_not_found',404);}
   const revision=ctx.area==='hub'?(await c.query('SELECT legal_revision FROM identity.companies WHERE id=$1 FOR SHARE',[u.company_id])).rows[0].legal_revision:null;
   await c.query(`INSERT INTO ${table}(id,company_id,kind,parent_id,name,mime,size,sha256,storage_key${ctx.area==='hub'?',legal_revision':''}) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9${ctx.area==='hub'?',$10':''})`,[docid,u.company_id,b.kind,parent,name,mime,bytes.length,digest(bytes),key,...(ctx.area==='hub'?[revision]:[])]);
   if(ctx.area==='hub')await c.query("INSERT INTO identity.audit(company_id,actor_id,action,entity_id,details) VALUES($1,$2,'document.uploaded',$3,$4)",[u.company_id,u.id,docid,{kind:b.kind}]);
   else if(ctx.area==='trade')await c.query("INSERT INTO trade.audit(company_id,actor_id,action,entity_id) VALUES($1,$2,'document.uploaded',$3)",[u.company_id,u.id,docid]);
   else await c.query("INSERT INTO caspian.audit_log(organization_id,entity_type,entity_id,action,metadata) VALUES($1,'document',$2,'document.uploaded',$3)",[u.company_id,docid,{actor_id:u.id,kind:b.kind}]);
  });}catch(e){await fs.unlink(path.join(ctx.config.documents,key));throw e;}
  ctx.status=201;return {id:docid,status:'quarantined',legal_validity:'not_certified'};
 }
 if(match[1] && ctx.req.method==='POST' && match[2]==='review'){
  requireAdmin(ctx);const note=str(ctx.body.note,10,2000);check(['reviewed','rejected'].includes(ctx.body.status));
  return run(async c=>{const r=await c.query(`UPDATE ${table} SET status=$2,review_note=$3 WHERE id=$1 RETURNING company_id`,[id(match[1]),ctx.body.status,note]);check(r.rowCount,'not_found',404);await ctx.identity.query('INSERT INTO identity.audit(company_id,actor_id,action,entity_id,details) VALUES($1,$2,$3,$4,$5)',[r.rows[0].company_id,u.id,'document.reviewed',match[1],{area:ctx.area,status:ctx.body.status,note}]);return {ok:true};});
 }
 if(match[1] && ctx.req.method==='PATCH' && !match[2] && ctx.area==='trade'){
  requireCompany(ctx,'trade');check(['company','registered'].includes(ctx.body.visibility));if(ctx.body.visibility==='registered')requireCompany(ctx,'trade',true);
  return run(async c=>{const doc=(await c.query(`SELECT id,status FROM ${table} WHERE id=$1 AND company_id=$2 FOR UPDATE`,[id(match[1]),u.company_id])).rows[0];check(doc,'not_found',404);if(ctx.body.visibility==='registered')check(doc.status==='reviewed','document_review_required',409);await c.query(`UPDATE ${table} SET visibility=$2 WHERE id=$1`,[doc.id,ctx.body.visibility]);await c.query("INSERT INTO trade.audit(company_id,actor_id,action,entity_id) VALUES($1,$2,'document.visibility',$3)",[u.company_id,u.id,doc.id]);return {ok:true};});
 }
 if(match[1] && ctx.req.method==='GET' && !match[2]){
  const doc=await run(async c=>(await c.query(`SELECT * FROM ${table} WHERE id=$1 AND ($2::boolean OR company_id=$3::uuid ${ctx.area==='trade'?"OR (visibility='registered' AND status='reviewed')":''})`,[id(match[1]),admin,u.company_id||null])).rows[0]);if(!doc)fail(404,'not_found');
  if(!admin && doc.company_id!==u.company_id){requireCompany(ctx,null,true);check((await ctx.identity.query("SELECT id FROM identity.companies WHERE id=$1 AND status='verified'",[doc.company_id])).rowCount,'not_found',404);}
  if(admin)await ctx.identity.query("INSERT INTO identity.audit(company_id,actor_id,action,entity_id,details) VALUES($1,$2,'document.admin_download',$3,$4)",[doc.company_id,u.id,doc.id,{area:ctx.area}]);
  const encrypted=await fs.readFile(path.join(ctx.config.documents,doc.storage_key));const decipher=createDecipheriv('aes-256-gcm',Buffer.from(ctx.config.document_key,'hex'),encrypted.subarray(0,12));decipher.setAuthTag(encrypted.subarray(-16));const bytes=Buffer.concat([decipher.update(encrypted.subarray(12,-16)),decipher.final()]);check(digest(bytes)===doc.sha256,'file_integrity',500);
  ctx.res.writeHead(200,{'Content-Type':doc.mime,'Content-Disposition':`attachment; filename="document${doc.mime==='application/pdf'?'.pdf':'.jpg'}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,'Content-Length':bytes.length,'Content-Security-Policy':"sandbox; default-src 'none'"});ctx.res.end(bytes);return {sent:true};
 }
 fail(405,'method_not_allowed');
}
