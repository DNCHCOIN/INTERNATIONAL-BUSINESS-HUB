import {randomBytes,createHash,scrypt,timingSafeEqual,randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
export const uuid=()=>randomUUID();
export const token=()=>randomBytes(32).toString('base64url');
export const digest=x=>createHash('sha256').update(x).digest('hex');
const derive=promisify(scrypt);
let hashing=0;
export function fail(status,code,fields){const e=new Error(code);Object.assign(e,{status,code,fields});throw e;}
export const check=(condition,code='invalid_input',status=422)=>{if(!condition)fail(status,code);};
export function str(x,min=1,max=180){check(typeof x==='string' && x.trim().length>=min && x.trim().length<=max);return x.trim();}
export function num(x,min,max){check(typeof x==='number' && Number.isFinite(x) && x>=min && x<=max);return x;}
export function choice(x,values){check(values.includes(x));return x;}
export function id(x){check(typeof x==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x));return x;}
export function email(x){x=str(x,5,254).toLowerCase();check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));return x;}
export function date(x){check(typeof x==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x));check(Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10)===x);return x;}
export async function passwordHash(password){
 check(typeof password==='string' && password.length>=12 && password.length<=128,'password_length');
 if(hashing>=2)fail(429,'busy_retry');hashing++;
 try {const salt=randomBytes(16);const hash=await derive(password,salt,64,{N:65536,r:8,p:1,maxmem:80*1024*1024});return `scrypt$65536$${salt.toString('hex')}$${hash.toString('hex')}`;}finally{hashing--;}
}
export async function passwordMatches(password,encoded){
 if(typeof password!=='string' || password.length>128)return false;
 if(hashing>=2)fail(429,'busy_retry');hashing++;
 try{const [algorithm,n,salt,hash]=encoded.split('$');if(algorithm!=='scrypt'||n!=='65536')return false;const result=await derive(password,Buffer.from(salt,'hex'),64,{N:65536,r:8,p:1,maxmem:80*1024*1024});const expected=Buffer.from(hash,'hex');return result.length===expected.length && timingSafeEqual(result,expected);}finally{hashing--;}
}
export async function transaction(pool,fn){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function scoped(pool,companyId,fn){return transaction(pool,async c=>{await c.query("SELECT set_config('app.organization_id',$1,true)",[companyId]);return fn(c);});}
export function can(user,area){return !!user && (user.role==='owner'||(area==='trade' && user.role==='trader')||(area==='caspian' && user.role==='dispatcher'));}
export function requireUser(ctx){if(!ctx.user)fail(401,'sign_in_required');return ctx.user;}
export function requireCompany(ctx,area,verified=false){const u=requireUser(ctx);if(!u.company_id || !u.company_active || u.company_status==='suspended')fail(403,'company_access_denied');if(area && !can(u,area))fail(403,'role_denied');if(verified && u.company_status!=='verified')fail(403,'verification_required');return u;}
export function requireAdmin(ctx){const u=requireUser(ctx);if(u.system_role!=='administrator')fail(403,'administrator_required');return u;}
export async function audit(c,company,actor,action,entity,details={}){await c.query('INSERT INTO identity.audit(company_id,actor_id,action,entity_id,details) VALUES($1,$2,$3,$4,$5)',[company,actor,action,entity,details]);}
