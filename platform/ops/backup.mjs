import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {createCipheriv,randomBytes} from 'node:crypto';
process.umask(0o077);
if(!process.argv.includes('--application-stopped'))throw new Error('Stop the business service before taking a consistent backup');
const config=JSON.parse(await fs.readFile(process.env.DNCH_CONFIG,'utf8'));
const dest=process.env.DNCH_BACKUP_DIR;if(!dest||!path.isAbsolute(dest))throw new Error('Private backup directory required');
await fs.mkdir(dest,{recursive:true,mode:0o700});
const keyPath=process.env.DNCH_BACKUP_KEY;if(!keyPath)throw new Error('Separate backup key path required');
let key;try{key=await fs.readFile(keyPath);}catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32);await fs.writeFile(keyPath,key,{mode:0o600,flag:'wx'});}if(key.length!==32)throw new Error('Invalid backup key');
const tmp=await fs.mkdtemp(path.join(dest,'.backup-'));
const output=path.join(dest,`dnch-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomBytes(3).toString('hex')}.dnchbk`);
async function run(command,args,options={}){await new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','ignore','pipe'],...options});let error='';child.stderr.on('data',x=>error+=x.toString());child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(`${path.basename(command)} failed (${code})`)));});}
try{
 for(const name of ['identity','trade','caspian'])await run(path.join(process.env.PG_BIN,'pg_dump'),['--format=custom','--no-owner','--no-acl','--file',path.join(tmp,`${name}.dump`),config.databases[name].database]);
 await fs.copyFile(process.env.DNCH_CONFIG,path.join(tmp,'config.json'));
 await fs.cp(config.documents,path.join(tmp,'documents'),{recursive:true,force:false}).catch(async e=>{if(e.code==='ENOENT')await fs.mkdir(path.join(tmp,'documents'));else throw e;});
 const archive=path.join(tmp,'backup.tar.gz');await run('tar',['-czf',archive,'-C',tmp,'identity.dump','trade.dump','caspian.dump','config.json','documents']);
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);await fs.writeFile(output+'.tmp',Buffer.concat([Buffer.from('DNCHBK01'),iv]),{mode:0o600,flag:'wx'});
 await pipeline(createReadStream(archive),cipher,createWriteStream(output+'.tmp',{flags:'a'}));await fs.appendFile(output+'.tmp',cipher.getAuthTag());await fs.rename(output+'.tmp',output);
 const handle=await fs.open(output,'r');await handle.sync();await handle.close();
 console.log(JSON.stringify({result:'PASS',backup:output,bytes:(await fs.stat(output)).size,encrypted:true,consistent_application_stopped:true}));
}finally{await fs.rm(tmp,{recursive:true,force:true});await fs.rm(output+'.tmp',{force:true});}
