import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import pg from 'pg';
import * as helpers from './common.mjs';
import {authenticate,identityRoutes} from './identity.mjs';
import {documentRoutes} from './documents.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
pg.types.setTypeParser(1082,x=>x);
export async function start(config){
 if(config.mode!=='private-staging')throw new Error('Only isolated private staging is supported by this release');
 if(!/^[a-f0-9]{64}$/.test(config.document_key))throw new Error('Private document encryption key required');
 const pools=Object.fromEntries(['identity','trade','caspian'].map(k=>[k,new pg.Pool({...config.databases[k],max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:5000,statement_timeout:10000})]));
 for(const pool of Object.values(pools))pool.on('error',()=>console.error('database_pool_error'));
 const {createTradeRoutes}=await import(pathToFileURL(path.join(config.sources.trade,'service/api.mjs')));
 const {createCaspianRoutes}=await import(pathToFileURL(path.join(config.sources.caspian,'service/api.mjs')));
 const handlers={trade:createTradeRoutes(helpers),caspian:createCaspianRoutes(helpers)};
 const buckets=new Map();
 function limit(key,max=120,window=60000){const now=Date.now();if(buckets.size>10000)for(const [k,v] of buckets)if(v.end<now)buckets.delete(k);let b=buckets.get(key);if(!b||b.end<=now){b={count:0,end:now+window};buckets.set(key,b);}if(++b.count>max)helpers.fail(429,'rate_limited');}
 const servers=[];
 for(const area of ['hub','trade','caspian']){
  const port=config.ports[area];const server=http.createServer(async(req,res)=>{
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
   res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
   const host=String(req.headers.host||'');
   try{
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))helpers.fail(403,'host_denied');
    if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(req.method))helpers.fail(405,'method_not_allowed');
    limit(`ip:${req.socket.remoteAddress}`,240,60000);
    const url=new URL(req.url,`http://${host}`);const mutating=!['GET','HEAD'].includes(req.method);
    if(mutating){if(req.headers.origin!==`http://${host}` || req.headers['x-dnch-request']!=='1')helpers.fail(403,'origin_denied');if(!String(req.headers['content-type']).startsWith('application/json'))helpers.fail(415,'json_required');}
    if(url.pathname.startsWith('/api/')){
     const user=await authenticate(pools.identity,req);let body={};
     if(mutating){
      if(!['/api/auth/register','/api/auth/login','/api/auth/accept-invitation'].includes(url.pathname)){helpers.requireUser({user});if(req.headers['x-csrf-token']!==user.csrf)helpers.fail(403,'csrf_denied');}
      if(['/api/auth/register','/api/auth/accept-invitation'].includes(url.pathname))limit('registration',20,3600000);
      const chunks=[];let size=0;const max=url.pathname==='/api/documents'?7100000:131072;
      for await(const chunk of req){size+=chunk.length;if(size>max)helpers.fail(413,'body_too_large');chunks.push(chunk);}
      try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{helpers.fail(400,'invalid_json');}helpers.check(body && typeof body==='object' && !Array.isArray(body),'invalid_json',400);
     }
     const ctx={...pools,config,area,req,res,url,user,body,limit,secure:false,status:200};let result;
     if(url.pathname==='/api/environment' && req.method==='GET')result={area,mode:'private_staging',data:'synthetic',platforms:Object.fromEntries(Object.entries(config.ports).map(([k,v])=>[k,`http://${host.startsWith('localhost')?'localhost':'127.0.0.1'}:${v}/`])),email_delivery:'not_configured',legal_verification:'human_review',cross_domain_sso:'not_configured'};
     else if(url.pathname==='/api/health' && req.method==='GET'){await Promise.all(Object.values(pools).map(p=>p.query('SELECT 1')));result={ok:true,mode:'private_staging',version:'0.1.0'};}
     else if(url.pathname==='/api/dashboard' && req.method==='GET'){
      const u=helpers.requireUser(ctx);
      if(u.system_role==='administrator')result={companies:(await pools.identity.query('SELECT status,count(*)::int AS total FROM identity.companies GROUP BY status')).rows,memory_rss_bytes:process.memoryUsage().rss,uptime_seconds:Math.floor(process.uptime()),email_delivery:'not_configured'};
      else {helpers.requireCompany(ctx);result=await helpers.scoped(pools.trade,u.company_id,async c=>({listings:Number((await c.query("SELECT count(*) FROM trade.listings WHERE company_id=$1 AND status<>'removed'",[u.company_id])).rows[0].count),inquiries:Number((await c.query('SELECT count(*) FROM trade.inquiries')).rows[0].count)}));Object.assign(result,await helpers.scoped(pools.caspian,u.company_id,async c=>({cargo:Number((await c.query("SELECT count(*) FROM caspian.cargo_requests WHERE status<>'cancelled'")).rows[0].count),shipments:Number((await c.query('SELECT count(*) FROM caspian.shipments')).rows[0].count)})));}
     }else if(url.pathname.startsWith('/api/documents'))result=await documentRoutes(ctx);
     else if(url.pathname.startsWith('/api/trade/') && area==='trade')result=await handlers.trade(ctx);
     else if(url.pathname.startsWith('/api/caspian/') && area==='caspian')result=await handlers.caspian(ctx);
     else if(url.pathname.startsWith('/api/admin/') && area!=='hub')helpers.fail(404,'not_found');
     else result=await identityRoutes(ctx);
     if(result===undefined)helpers.fail(404,'not_found');if(res.writableEnded)return;
     const json=JSON.stringify(result);res.writeHead(ctx.status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(json)});res.end(req.method==='HEAD'?undefined:json);return;
    }
    if(mutating)helpers.fail(405,'method_not_allowed');
    const shared={'/':'workspace.html','/workspace':'workspace.html','/workspace.mjs':'workspace.mjs','/workspace.css':'workspace.css'};
    let file=shared[url.pathname]?path.join(base,'public',shared[url.pathname]):null;
    if(!file){let name=url.pathname==='/preview'?'index.html':url.pathname.slice(1);if(!/^[A-Za-z0-9_-]+\.(html|js|css|svg|png|jpg|webp|ico)$/.test(name))helpers.fail(404,'not_found');file=path.join(config.sources[area],name);}
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
    const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
   }catch(e){if(res.headersSent){res.destroy();return;}let status=e.status||500,code=e.code||'internal_error';if(e.code==='23505'){status=409;code='duplicate_record';}if(['23503','23514','22P02','22007','22008'].includes(e.code)){status=422;code='invalid_input';}if(e.code==='ENOENT'){status=404;code='not_found';}if(status===500)console.error('request_failed',e.code||e.name);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:code,fields:e.fields}));}
  });
  server.requestTimeout=15000;server.headersTimeout=5000;server.maxConnections=40;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});servers.push(server);
 }
 const cleanup=setInterval(()=>{pools.identity.query("DELETE FROM identity.sessions WHERE expires_at<now() OR last_seen<now()-interval '2 hours'").catch(()=>{});},3600000);cleanup.unref();
 return {pools,servers,close:async()=>{clearInterval(cleanup);for(const s of servers)await new Promise(r=>s.close(r));for(const p of Object.values(pools))await p.end();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const config=JSON.parse(await fs.readFile(process.env.DNCH_CONFIG,'utf8'));const app=await start(config);console.log('DNCH business staging ready on loopback');for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0);});
}
