// Private local database provisioning. No secrets are printed or committed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
const root=process.env.DNCH_STATE;if(!root || !path.isAbsolute(root))throw new Error('DNCH_STATE absolute private directory required');
const configPath=path.join(root,'config.json');
try{await fs.access(configPath);throw new Error('Existing config: refusing to replace credentials');}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(root,{recursive:true,mode:0o700});
const pool=new pg.Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT||18810),user:process.env.PGUSER||process.env.USER,database:'postgres'});
const config={mode:'private-staging',ports:{trade:18801,caspian:18802,hub:18803},sources:{hub:process.env.DNCH_HUB_SOURCE,trade:process.env.DNCH_TRADE_SOURCE,caspian:process.env.DNCH_CASPIAN_SOURCE},databases:{},documents:path.join(root,'documents'),document_key:randomBytes(32).toString('hex')};
try{
 for(const key of ['identity','trade','caspian']){
  const role=`dnch_${key}_app`,database=`dnch_${key}`,password=randomBytes(32).toString('base64url');
  if((await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)throw new Error('Existing role: manual recovery required');
  // Identifiers are fixed constants; password is generated locally, never accepted from a caller.
  await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await pool.query(`CREATE DATABASE ${database}`);await pool.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC; GRANT CONNECT ON DATABASE ${database} TO ${role}`);
  config.databases[key]={host:process.env.PGHOST,port:Number(process.env.PGPORT||18810),database,user:role,password};
 }
 await fs.writeFile(configPath,JSON.stringify(config,null,2),{mode:0o600,flag:'wx'});console.log('Private configuration and three isolated databases created');
}finally{await pool.end();}
