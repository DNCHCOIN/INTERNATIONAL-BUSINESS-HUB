import test from 'node:test';
import assert from 'node:assert/strict';
import {passwordHash,passwordMatches,can,date,requireCompany} from '../src/common.mjs';
import {companyInput} from '../src/profile.mjs';
import {detectMime} from '../src/documents.mjs';
test('passwords use unique salts and reject wrong or oversized passwords',async()=>{const a=await passwordHash('synthetic-password-123'),b=await passwordHash('synthetic-password-123');assert.notEqual(a,b);assert.equal(await passwordMatches('synthetic-password-123',a),true);assert.equal(await passwordMatches('wrong',a),false);assert.equal(await passwordMatches('x'.repeat(1000),a),false);});
test('roles cannot cross business permissions and suspended companies are denied',()=>{assert.equal(can({role:'viewer'},'trade'),false);assert.equal(can({role:'dispatcher'},'trade'),false);assert.equal(can({role:'trader'},'caspian'),false);assert.equal(can({role:'owner'},'caspian'),true);assert.throws(()=>requireCompany({user:{company_id:'x',company_active:true,company_status:'suspended'}}),/company_access_denied/);});
test('dates reject impossible days and documents reject active HTML',()=>{assert.throws(()=>date('2026-02-30'));assert.throws(()=>date('invalid'));assert.equal(date('2026-11-25'),'2026-11-25');assert.equal(detectMime(Buffer.from('<html>malicious</html>')),null);assert.equal(detectMime(Buffer.from('%PDF-1.4\n')),'application/pdf');});
test('registration requires company identifiers and explicit chamber choices',()=>{assert.throws(()=>companyInput({country:'BG',registration_number:'123'}));});
