// Root DB access via a private peer-authenticated Unix socket. Restores into fresh QA databases only.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import pg from 'pg';
import assert from 'node:assert/strict';
import {createDecipheriv,createHash} from 'node:crypto';
const target=process.argv[2];if(!target||!target.includes('qa-'))throw new Error('Disposable qa- extracted backup required');
const config=JSON.parse(await fs.readFile(path.join(target,'config.json'),'utf8'));
const root={host:process.env.PGHOST,port:Number(process.env.PGPORT),user:process.env.USER};
const control=new pg.Pool({...root,database:'postgres'}),counts={};
try{
 for(const name of ['identity','trade','caspian']){
  const database=`dnch_restore_qa_${name}`;await control.query(`CREATE DATABASE ${database}`);
  try{
   await new Promise((resolve,reject)=>{const child=spawn(path.join(process.env.PG_BIN,'pg_restore'),['--no-owner','--no-acl','--dbname',database,path.join(target,`${name}.dump`)],{stdio:'ignore'});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Restore failed')));});
   const table={identity:'identity.companies',trade:'trade.listings',caspian:'caspian.shipments'}[name];
   const restored=new pg.Pool({...root,database}),source=new pg.Pool({...root,database:config.databases[name].database});
   try{const a=Number((await restored.query(`SELECT count(*) FROM ${table}`)).rows[0].count),b=Number((await source.query(`SELECT count(*) FROM ${table}`)).rows[0].count);assert.equal(a,b);counts[name]=a;
    if(name==='identity'){const documents=(await restored.query('SELECT storage_key,sha256 FROM identity.documents')).rows;for(const doc of documents){const bytes=await fs.readFile(path.join(target,'documents',doc.storage_key));const decipher=createDecipheriv('aes-256-gcm',Buffer.from(config.document_key,'hex'),bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(-16));const plain=Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]);assert.equal(createHash('sha256').update(plain).digest('hex'),doc.sha256);}counts.restored_document_integrity=documents.length;}
   }finally{await restored.end();await source.end();}
  }finally{await control.query(`DROP DATABASE ${database}`);}
 }
 console.log(JSON.stringify({result:'PASS',restored_database_counts:counts,production_modified:false}));
}finally{await control.end();}
