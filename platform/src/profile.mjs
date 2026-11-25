import {check,str,choice,email} from './common.mjs';
export const SECTORS=['Agriculture','Technology','Textile','Logistics','Food','Machinery','Other'];
export const ACTIVITIES=['Manufacturer','Distributor','Importer','Exporter','Logistics company'];
export function companyInput(b){
 const country=choice(b.country,['BG','CN']);
 const registration_number=str(b.registration_number,9,18).toUpperCase();
 check(country==='BG'? /^(\d{9}|\d{13})$/.test(registration_number):/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(registration_number),'registration_format');
 const address={city:str(b.city,2,100),postal_code:str(b.postal_code,2,20),street:str(b.street,2,250)};
 check(typeof b.chamber_bg==='boolean' && typeof b.chamber_cn==='boolean','chamber_selection_required');
 check(Array.isArray(b.languages) && b.languages.length>0 && b.languages.every(l=>['bg','en','zh'].includes(l)));
 check(/^\+[0-9 ()-]{7,24}$/.test(b.phone),'phone_format');
 let website=str(b.website||'',0,250);if(website){let u;try{u=new URL(website);}catch{check(false,'website_format');}check(['https:','http:'].includes(u.protocol));website=u.href;}
 const profile={contact_name:str(b.contact_name,2,100),position:str(b.position,2,100),contact_email:email(b.contact_email),phone:b.phone,wechat:str(b.wechat||'',0,100),sector:choice(b.sector,SECTORS),activity:choice(b.activity,ACTIVITIES),languages:[...new Set(b.languages)],website,description:str(b.description,10,4000),partners:str(b.partners||'',0,1000),employees:choice(b.employees,['1-5','5-20','20-50','50-200','200+']),experience:str(b.experience||'',0,2000),chamber_bg:b.chamber_bg,chamber_cn:b.chamber_cn};
 return {country,registration_number,name_native:str(b.name_native,2,180),name_latin:str(b.name_latin,2,180),legal_form:str(b.legal_form,2,80),vat_number:str(b.vat_number||'',0,40),address,profile};
}
