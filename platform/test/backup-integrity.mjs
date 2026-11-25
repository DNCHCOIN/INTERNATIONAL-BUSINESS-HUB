import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const input=process.env.DNCH_QA_BACKUP;if(!input?.includes('qa-'))throw new Error('Disposable QA backup required');
const bad=path.join(path.dirname(input),'tampered.dnchbk'),target=path.join(path.dirname(input),'qa-tampered-extract');
const data=await fs.readFile(input);data[25]^=1;await fs.writeFile(bad,data,{mode:0o600});
try{const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(new URL('../ops/restore-extract.mjs',import.meta.url)),bad,target],{stdio:'ignore'});child.on('error',reject);child.on('close',resolve);});assert.notEqual(code,0);await assert.rejects(fs.access(target));console.log(JSON.stringify({result:'PASS',tampered_backup_rejected:true,unauthenticated_content_extracted:false}));}finally{await fs.rm(bad,{force:true});}
