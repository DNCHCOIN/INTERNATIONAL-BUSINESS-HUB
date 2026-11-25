// Decrypt/authenticate first; extract only into a brand new directory. Does not modify a running DB.
import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createDecipheriv} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
process.umask(0o077);
const [input,target]=process.argv.slice(2);if(!input||!target||!path.isAbsolute(target))throw new Error('Input archive and new absolute target required');
await fs.mkdir(target,{recursive:false,mode:0o700});const archive=path.join(target,'.authenticated.tar.gz');
try{
 const handle=await fs.open(input,'r'),stat=await handle.stat();if(stat.size<36)throw new Error('Invalid backup');
 const header=Buffer.alloc(20),tag=Buffer.alloc(16);await handle.read(header,0,20,0);await handle.read(tag,0,16,stat.size-16);await handle.close();if(header.subarray(0,8).toString()!=='DNCHBK01')throw new Error('Invalid backup header');
 const key=await fs.readFile(process.env.DNCH_BACKUP_KEY),decipher=createDecipheriv('aes-256-gcm',key,header.subarray(8));decipher.setAuthTag(tag);
 await pipeline(createReadStream(input,{start:20,end:stat.size-17}),decipher,createWriteStream(archive,{mode:0o600,flags:'wx'}));
 await new Promise((resolve,reject)=>{const c=spawn('tar',['-xzf',archive,'-C',target],{stdio:'ignore'});c.on('error',reject);c.on('close',code=>code===0?resolve():reject(new Error('Extraction failed')));});
 console.log(JSON.stringify({result:'PASS',restored_files:target,databases_not_modified:true}));
}catch(e){await fs.rm(target,{recursive:true,force:true});throw e;}finally{await fs.rm(archive,{force:true});}
