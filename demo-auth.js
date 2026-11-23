/* Public demonstration only. This is NOT authentication or authorization.
   Never trust localStorage or this client-side hash to secure real data. */
(()=>{
 'use strict';
 const KEY='ibh_preview_session_v1';
 const USERS=new Set(['nedka-admin','tsvetan-admin']);
 const EXPECTED='4227c46717237e8edf3e686b7cbd8b905e3f5eed03df52eefd612a228143c67a';
 const $=s=>document.querySelector(s);
 const labelLang=()=>document.documentElement.lang.startsWith('zh')?'zh':document.documentElement.lang.startsWith('en')?'en':'bg';
 const messages={
  bg:{ready:'Демонстрационен вход. Няма достъп до реални администраторски данни.',bad:'Невалидно демо потребителско име или парола.',signed:'Демо вход: ',logout:'Изход от демото',go:'Към TRADE и LOGISTICS',button:'Влез в демо режим'},
  en:{ready:'Preview login only. No access to real administrative data.',bad:'Invalid preview username or password.',signed:'Preview session: ',logout:'Exit preview',go:'Open TRADE and LOGISTICS',button:'Enter demo mode'},
  zh:{ready:'仅为演示登录。无法访问真实管理数据。',bad:'演示用户名或密码无效。',signed:'演示会话：',logout:'退出演示',go:'访问 TRADE 和 LOGISTICS',button:'进入演示模式'}
 };
 const dict=()=>messages[labelLang()]||messages.bg;
 function current(){
  try{const data=JSON.parse(localStorage.getItem(KEY)||'null');return data&&USERS.has(data.username)&&data.expires>Date.now()?data:null;}catch{return null;}
 }
 async function demoCheck(value){
  const data=new TextEncoder().encode('caspian-preview-v1:'+value);
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',data));
  return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')===EXPECTED;
 }
 const username=$('#login-username'),password=$('#login-password'),button=$('.login-submit'),warning=$('.login-warning'),preview=$('.login-preview');
 if(!username||!password||!button||!preview)return;
 const status=document.createElement('div');status.className='demo-session';status.setAttribute('role','status');
 const logout=document.createElement('button');logout.type='button';logout.className='button dark-button';logout.style.marginTop='12px';
 logout.addEventListener('click',()=>{try{localStorage.removeItem(KEY);}catch{}render();});
 status.append(document.createElement('strong'),logout);
 preview.append(status);
 const label=document.createElement('p');label.className='login-warning';label.textContent='';preview.append(label);
 button.disabled=false;
 function render(){
  const session=current(),d=dict();
  button.textContent=d.button;
  warning.textContent=d.ready;
  label.textContent=session?d.go:'';
  status.hidden=!session;
  if(session){status.querySelector('strong').textContent=d.signed+session.username+' · DEMO';logout.textContent=d.logout;}
 }
 async function login(){
  const user=username.value.trim().toLowerCase();
  const pass=password.value;
  password.value='';
  button.disabled=true;
  try{
   if(!USERS.has(user)||!await demoCheck(pass)){warning.textContent=dict().bad;return;}
   localStorage.setItem(KEY,JSON.stringify({username:user,expires:Date.now()+8*3600000}));
   render();warning.textContent=dict().ready;
  }catch{warning.textContent=dict().bad;}
  finally{button.disabled=false;}
 }
 button.addEventListener('click',login);
 password.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();login();}});
 username.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();password.focus();}});
 render();
 document.getElementById('language')?.addEventListener('change',()=>queueMicrotask(render));
})();