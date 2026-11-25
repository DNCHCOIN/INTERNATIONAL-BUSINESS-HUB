import fs from 'node:fs/promises';
import path from 'node:path';
const config=JSON.parse(await fs.readFile(process.env.DNCH_CONFIG,'utf8'));
const checks=await Promise.all([...Object.entries(config.ports),['dnch',8083]].map(async([name,port])=>{try{const r=await fetch(`http://127.0.0.1:${port}/${name==='dnch'?'':'api/health'}`,{signal:AbortSignal.timeout(4000)});return {name,ok:r.status===200,status:r.status};}catch{return {name,ok:false,status:null};}}));
const backupDir=process.env.DNCH_BACKUP_DIR;const files=backupDir?(await fs.readdir(backupDir).catch(()=>[])).filter(f=>f.endsWith('.dnchbk')):[];
const newest=files.length?Math.max(...await Promise.all(files.map(async f=>(await fs.stat(path.join(backupDir,f))).mtimeMs))):null;
const result={checked_at:new Date().toISOString(),ok:checks.every(c=>c.ok),checks,encrypted_backup_count:files.length,backup_age_hours:newest===null?null:Math.round((Date.now()-newest)/3600000*100)/100};
await fs.writeFile(path.join(path.dirname(process.env.DNCH_CONFIG),'monitor.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
