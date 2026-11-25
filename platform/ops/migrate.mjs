import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await fs.readFile(process.env.DNCH_CONFIG,'utf8'));
const migrations={identity:[path.join(here,'db/001_identity.sql')],trade:[path.join(config.sources.trade,'service/001_trade.sql')],caspian:[path.join(config.sources.caspian,'db/migrations/0001_initial.sql'),path.join(config.sources.caspian,'service/002_platform.sql')]};
for(const [key,files] of Object.entries(migrations)){
 const pool=new pg.Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT||18810),user:process.env.PGUSER||process.env.USER,database:config.databases[key].database});
 try{
  for(const file of files)await pool.query(await fs.readFile(file,'utf8'));
  const schema=key==='identity'?'identity':key,role=config.databases[key].user;
  if(!/^[a-z_]+$/.test(role))throw new Error('invalid role');
  await pool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} TO ${role}`);
  const auditTable=key==='caspian'?'audit_log':'audit';await pool.query(`REVOKE UPDATE,DELETE ON ${schema}.${auditTable} FROM ${role}`);
  console.log(`${key}: migration applied`);
 }finally{await pool.end();}
}
