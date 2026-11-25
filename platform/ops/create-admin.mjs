// Input JSON via stdin only: {email, display_name, password}. No default account.
import fs from 'node:fs/promises';
import pg from 'pg';
import {passwordHash,email,str,uuid} from '../src/common.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;if(input.length>4096)throw new Error('input_too_large');const b=JSON.parse(input);
const config=JSON.parse(await fs.readFile(process.env.DNCH_CONFIG,'utf8'));const pool=new pg.Pool(config.databases.identity);
try{await pool.query("INSERT INTO identity.users(id,email,display_name,password_hash,system_role) VALUES($1,$2,$3,$4,'administrator')",[uuid(),email(b.email),str(b.display_name,2,100),await passwordHash(b.password)]);console.log('Administrator created; no credentials printed');}finally{await pool.end();}
