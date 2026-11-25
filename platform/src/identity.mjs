import {audit,check,choice,digest,email,fail,id,passwordHash,passwordMatches,requireAdmin,requireCompany,requireUser,str,token,transaction,uuid} from './common.mjs';
import {companyInput} from './profile.mjs';
const PUBLIC_USER=['id','email','display_name','system_role','company_id','role','company_status'];
export function publicUser(u){return Object.fromEntries(PUBLIC_USER.map(k=>[k,u[k]??null]));}
export async function authenticate(pool,req){
 const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('dnch_staging='));
 const raw=cookie?.slice(13);if(!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw))return null;
 const {rows}=await pool.query(`SELECT u.id,u.email,u.display_name,u.system_role,s.csrf,s.token_hash,m.company_id,m.role,
 m.active AS company_active,c.status AS company_status FROM identity.sessions s
 JOIN identity.users u ON u.id=s.user_id LEFT JOIN identity.memberships m ON m.user_id=u.id
 LEFT JOIN identity.companies c ON c.id=m.company_id
 WHERE s.token_hash=$1 AND s.expires_at>now() AND s.last_seen>now()-interval '2 hours' AND u.active`,[digest(raw)]);
 if(rows[0])await pool.query('UPDATE identity.sessions SET last_seen=now() WHERE token_hash=$1',[digest(raw)]);
 return rows[0]||null;
}
async function session(ctx,userId){
 const raw=token(),csrf=token();
 await ctx.identity.query("INSERT INTO identity.sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",[digest(raw),userId,csrf]);
 ctx.res.setHeader('Set-Cookie',`dnch_staging=${raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${ctx.secure?'; Secure':''}`);
 return csrf;
}
export async function identityRoutes(ctx){
 const {url,req,identity,body}=ctx;const p=url.pathname;const method=req.method;
 if(p==='/api/auth/me' && method==='GET')return {user:ctx.user?publicUser(ctx.user):null,csrf:ctx.user?.csrf||null};
 if(p==='/api/auth/register' && method==='POST'){
  check(body.accept_terms===true,'terms_required');const company=companyInput(body);const login=email(body.email);const hashed=await passwordHash(body.password);const userId=uuid(),companyId=uuid();
  await transaction(identity,async c=>{
   await c.query(`INSERT INTO identity.companies(id,country,registration_number,name_native,name_latin,legal_form,vat_number,address,profile) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[companyId,...['country','registration_number','name_native','name_latin','legal_form','vat_number','address','profile'].map(k=>company[k])]);
   await c.query('INSERT INTO identity.users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[userId,login,company.profile.contact_name,hashed]);
   await c.query("INSERT INTO identity.memberships(user_id,company_id,role) VALUES($1,$2,'owner')",[userId,companyId]);
   await audit(c,companyId,userId,'company.registered',companyId);
  });
  await session(ctx,userId);ctx.status=201;return {company_id:companyId,status:'pending',email_verified:false};
 }
 if(p==='/api/auth/login' && method==='POST'){
  const login=email(body.email);ctx.limit(`login:${digest(login)}`,8,900000);
  const {rows}=await identity.query('SELECT id,password_hash,active FROM identity.users WHERE email=$1',[login]);
  const dummy='scrypt$65536$0123456789abcdef0123456789abcdef$'+'0'.repeat(128);
  const ok=await passwordMatches(body.password,rows[0]?.password_hash||dummy);
  if(!ok || !rows[0]?.active)fail(401,'invalid_credentials');
  if(ctx.user)await identity.query('DELETE FROM identity.sessions WHERE token_hash=$1',[ctx.user.token_hash]);
  const csrf=await session(ctx,rows[0].id);return {ok:true,csrf};
 }
 if(p==='/api/auth/logout' && method==='POST'){
  requireUser(ctx);await identity.query('DELETE FROM identity.sessions WHERE token_hash=$1',[ctx.user.token_hash]);
  ctx.res.setHeader('Set-Cookie',`dnch_staging=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${ctx.secure?'; Secure':''}`);return {ok:true};
 }
 if(p==='/api/company' && method==='GET'){
  const u=requireCompany(ctx);return (await identity.query('SELECT * FROM identity.companies WHERE id=$1',[u.company_id])).rows[0];
 }
 if(p==='/api/company' && method==='PUT'){
  const u=requireCompany(ctx);check(u.role==='owner','role_denied',403);const data=companyInput(body);check(Number.isInteger(body.version),'version_required');
  return transaction(identity,async c=>{
   const old=(await c.query('SELECT * FROM identity.companies WHERE id=$1 FOR UPDATE',[u.company_id])).rows[0];
   check(old.version===body.version,'version_conflict',409);check(old.status!=='suspended','company_suspended',403);
   // Legal identity changes always return to review. Operational edits keep existing verification.
   const legal=['country','registration_number','name_native','name_latin','legal_form','vat_number','address'];
   const changed=legal.some(k=>k==='address'?Object.keys(data.address).some(a=>old.address[a]!==data.address[a]):old[k]!==data[k]);
   const result=await c.query(`UPDATE identity.companies SET country=$2,registration_number=$3,name_native=$4,name_latin=$5,legal_form=$6,vat_number=$7,address=$8,profile=$9,status=$10,review_note=CASE WHEN $11 THEN '' ELSE review_note END,version=version+1 WHERE id=$1 RETURNING *`,[u.company_id,...['country','registration_number','name_native','name_latin','legal_form','vat_number','address','profile'].map(k=>data[k]),changed?'pending':old.status,changed]);
   await audit(c,u.company_id,u.id,'company.updated',u.company_id,{legal_changed:changed});return result.rows[0];
  });
 }
 if(p==='/api/company/members' && method==='GET'){
  const u=requireCompany(ctx);check(u.role==='owner','role_denied',403);
  return {items:(await identity.query('SELECT u.id,u.display_name,u.email,m.role,m.active FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.company_id=$1 ORDER BY u.created_at',[u.company_id])).rows};
 }
 if(p==='/api/company/invitations' && method==='POST'){
  const u=requireCompany(ctx);check(u.role==='owner','role_denied',403);const raw=token();
  await transaction(identity,async c=>{await c.query("INSERT INTO identity.invitations(token_hash,company_id,email,role,expires_at,invited_by) VALUES($1,$2,$3,$4,now()+interval '24 hours',$5)",[digest(raw),u.company_id,email(body.email),choice(body.role,['trader','dispatcher','viewer']),u.id]);await audit(c,u.company_id,u.id,'member.invited',null,{role:body.role});});
  ctx.status=201;return {invitation:raw,expires_in_hours:24,delivery:'manual'};
 }
 if(p==='/api/auth/accept-invitation' && method==='POST'){
  const hashed=await passwordHash(body.password),login=email(body.email);const uid=uuid();
  await transaction(identity,async c=>{
   const invitation=(await c.query('SELECT * FROM identity.invitations WHERE token_hash=$1 AND email=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE',[digest(str(body.invitation,43,43)),login])).rows[0];check(invitation,'invitation_invalid',400);
   await c.query('INSERT INTO identity.users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[uid,login,str(body.display_name,2,100),hashed]);
   await c.query('INSERT INTO identity.memberships(user_id,company_id,role) VALUES($1,$2,$3)',[uid,invitation.company_id,invitation.role]);
   await c.query('UPDATE identity.invitations SET used_at=now() WHERE token_hash=$1',[invitation.token_hash]);await audit(c,invitation.company_id,uid,'invitation.accepted',uid);
  });await session(ctx,uid);ctx.status=201;return {ok:true};
 }
 const member=p.match(/^\/api\/company\/members\/([\w-]+)$/);
 if(member && method==='PATCH'){
  const u=requireCompany(ctx);check(u.role==='owner','role_denied',403);check(member[1]!==u.id,'owner_protected',403);id(member[1]);check(typeof body.active==='boolean');
  return transaction(identity,async c=>{const r=await c.query("UPDATE identity.memberships SET role=$3,active=$4 WHERE company_id=$1 AND user_id=$2 AND role<>'owner' RETURNING user_id",[u.company_id,member[1],choice(body.role,['trader','dispatcher','viewer']),body.active]);check(r.rowCount,'not_found',404);await c.query('DELETE FROM identity.sessions WHERE user_id=$1',[member[1]]);await audit(c,u.company_id,u.id,'member.updated',member[1]);return {ok:true};});
 }
 if(p==='/api/directory' && method==='GET'){
  requireCompany(ctx,null,true);const q=str(url.searchParams.get('q')||'',0,100),country=url.searchParams.get('country')||'';
  const r=await identity.query(`SELECT id,name_native,name_latin,country,profile,address,status FROM identity.companies WHERE status='verified' AND ($1='' OR (name_native||' '||name_latin||' '||profile::text) ILIKE '%'||$1||'%') AND ($2='' OR country=$2) ORDER BY name_latin LIMIT 100`,[q,country]);return {items:r.rows};
 }
 if(p==='/api/admin/companies' && method==='GET'){
  requireAdmin(ctx);return {items:(await identity.query('SELECT id,country,registration_number,name_native,name_latin,status,review_note,version,created_at FROM identity.companies ORDER BY created_at DESC LIMIT 100')).rows};
 }
 const review=p.match(/^\/api\/admin\/companies\/([\w-]+)\/review$/);
 if(review && method==='POST'){
  const u=requireAdmin(ctx),cid=id(review[1]),state=choice(body.status,['verified','rejected','suspended']);const note=str(body.note,10,2000);
  return transaction(identity,async c=>{
   const company=(await c.query('SELECT * FROM identity.companies WHERE id=$1 FOR UPDATE',[cid])).rows[0];check(company,'not_found',404);check(body.version===company.version,'version_conflict',409);
   if(state==='verified'){const docs=await c.query("SELECT id FROM identity.documents WHERE company_id=$1 AND kind='registration' AND status='reviewed'",[cid]);check(docs.rowCount>0,'reviewed_registration_document_required',409);}
   await c.query('UPDATE identity.companies SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=now(),version=version+1 WHERE id=$1',[cid,state,note,u.id]);
   await audit(c,cid,u.id,'company.reviewed',cid,{status:state,note});return {ok:true,status:state};
  });
 }
 if(p==='/api/admin/audit' && method==='GET'){requireAdmin(ctx);return {items:(await identity.query('SELECT id,company_id,actor_id,action,entity_id,details,created_at FROM identity.audit ORDER BY id DESC LIMIT 100')).rows};}
 return undefined;
}
