const test=require('node:test');const assert=require('node:assert/strict');
const {validateProduct,nextReview}=require('../lib/marketplace');
const valid={name:'Ứng dụng',description:'Mô tả',platform:'android',category:'app',kind:'sale',price:25000,payment_method:'Chuyển khoản',contact:'seller@example.com'};
test('supports APK and EXE; future platforms are not accidentally enabled',()=>{for(const platform of ['android','windows'])assert.doesNotThrow(()=>validateProduct({...valid,platform}));for(const platform of ['ios','linux','unknown'])assert.throws(()=>validateProduct({...valid,platform}));});
test('sale requires price, payment and contact',()=>{for(const change of [{price:-1},{price:'abc'},{payment_method:''},{contact:''},{name:''},{name:'x'.repeat(161)}])assert.throws(()=>validateProduct({...valid,...change}));});
test('pending can be approved, rejected or returned once',()=>{for(const status of ['approved','rejected','returned'])assert.doesNotThrow(()=>nextReview({status:'pending',return_count:0},status));});
test('second return is blocked, including after history deletion',()=>{assert.throws(()=>nextReview({status:'pending',return_count:1},'returned'));assert.doesNotThrow(()=>nextReview({status:'pending',return_count:1},'approved'));assert.doesNotThrow(()=>nextReview({status:'pending',return_count:1},'rejected'));});
test('stale reviews cannot overwrite completed decisions',()=>{for(const status of ['approved','rejected','returned'])assert.throws(()=>nextReview({status,return_count:0},'approved'));assert.throws(()=>nextReview({status:'pending',return_count:0},'pending'));});
test('unauthenticated writes and review access are rejected at server',async()=>{const express=require('express');const app=express();app.use(express.json());app.use('/api/market',require('../lib/marketplace')({query(){throw Error('DB must not be accessed');}}));const server=app.listen(0);await new Promise(r=>server.once('listening',r));try{for(const [method,path] of [['POST','products'],['POST','files'],['GET','review'],['DELETE','history'],['PUT','products/00000000-0000-0000-0000-000000000000']]){const r=await fetch(`http://localhost:${server.address().port}/api/market/${path}`,{method});assert.equal(r.status,401);}}finally{server.close();}});
test('verified identity alone does not grant moderation; role and key are both required',async()=>{
 const express=require('express');const savedFetch=global.fetch;const oldKey=process.env.PRODUCT_REVIEW_KEY,oldFirebase=process.env.FIREBASE_WEB_API_KEY;process.env.PRODUCT_REVIEW_KEY='test-secret';process.env.FIREBASE_WEB_API_KEY='test-project';
 let role='USER';const pool={query:async(sql)=>({rows:sql.startsWith('SELECT role')?[{role}]:[]})};
 global.fetch=(url,opts)=>String(url).startsWith('https://identitytoolkit.googleapis.com/')?Promise.resolve({ok:true,json:async()=>({users:[{localId:'uid',email:'verified@example.com',emailVerified:true}]})}):savedFetch(url,opts);
 const app=express();app.use(express.json());app.use('/api/market',require('../lib/marketplace')(pool));const server=app.listen(0);await new Promise(r=>server.once('listening',r));
 const request=key=>savedFetch(`http://localhost:${server.address().port}/api/market/review`,{headers:{Authorization:'Bearer verified','X-Review-Key':key}});
 try{assert.equal((await request('test-secret')).status,403);role='ADMIN';assert.equal((await request('wrong')).status,403);assert.equal((await request('test-secret')).status,200);}finally{server.close();global.fetch=savedFetch;if(oldKey===undefined)delete process.env.PRODUCT_REVIEW_KEY;else process.env.PRODUCT_REVIEW_KEY=oldKey;if(oldFirebase===undefined)delete process.env.FIREBASE_WEB_API_KEY;else process.env.FIREBASE_WEB_API_KEY=oldFirebase;}
});
test('upload stores exact binary and computes its actual SHA-256',async()=>{
 const express=require('express'),crypto=require('crypto');const savedFetch=global.fetch;const oldFirebase=process.env.FIREBASE_WEB_API_KEY;process.env.FIREBASE_WEB_API_KEY='test-project';let saved;
 const pool={query:async(sql,params)=>{if(sql.startsWith('INSERT INTO lyrad_market_files'))saved=params;return {rows:sql.startsWith('SELECT coalesce')?[{n:0}]:[]};}};
 global.fetch=(url,opts)=>String(url).startsWith('https://identitytoolkit.googleapis.com/')?Promise.resolve({ok:true,json:async()=>({users:[{localId:'uid',email:'verified@example.com',emailVerified:true}]})}):savedFetch(url,opts);
 const app=express();app.use(express.json());app.use('/api/market',require('../lib/marketplace')(pool));const server=app.listen(0);await new Promise(r=>server.once('listening',r));
 try{
  const send=(filename,platform,bytes)=>savedFetch(`http://localhost:${server.address().port}/api/market/files`,{method:'POST',headers:{Authorization:'Bearer verified','Content-Type':'application/json'},body:JSON.stringify({filename,platform,base64:bytes.toString('base64')})});
  for(const platform of ['android','windows']){
   const fixtures=[['test.zip','504b0304'],['empty.ZIP','504b0506'],['split.zip','504b0708'],['old.rar','526172211a0700'],['new.RAR','526172211a070100'],['test.7z','377abcaf271c'],platform==='windows'?['test.exe','4d5a']:['test.apk','504b0304']];
   for(const [filename,header] of fixtures){
    const bytes=Buffer.concat([Buffer.from(header,'hex'),Buffer.from(' exact binary fixture')]);
    const r=await send(filename,platform,bytes);assert.equal(r.status,200,filename);assert.deepEqual(saved[5],bytes);assert.equal((await r.json()).sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.equal((await send(filename,platform,Buffer.from('wrong format'))).status,400);
   }
   for(const [filename,header] of [['fake.7z','504b0304'],['fake.rar','526172211a07'],['bad.zip.exe','504b0304'],['bad.txt','504b0304'],platform==='windows'?['bad.apk','504b0304']:['bad.exe','4d5a']])assert.equal((await send(filename,platform,Buffer.from(header,'hex'))).status,400);
  }
 }finally{server.close();global.fetch=savedFetch;if(oldFirebase===undefined)delete process.env.FIREBASE_WEB_API_KEY;else process.env.FIREBASE_WEB_API_KEY=oldFirebase;}
});
test('only the designated NPH can grant and revoke Admin; owner role is immutable', async () => {
 const express = require('express');
 const originalFetch = global.fetch;
 const originalKey = process.env.FIREBASE_WEB_API_KEY;
 process.env.FIREBASE_WEB_API_KEY = 'test-project';
 const roles = new Map([['yuriyir57@gmail.com', 'NPH'], ['admin@example.com', 'ADMIN']]);
 let identity = 'admin@example.com';
 const pool = {query: async (sql, values) => {
   if (sql.startsWith('SELECT role')) return {rows: roles.has(values[0]) ? [{role: roles.get(values[0])}] : []};
   if (sql.startsWith('INSERT INTO lyrad_market_roles')) roles.set(values[0], 'ADMIN');
   if (sql.startsWith('DELETE FROM lyrad_market_roles')) roles.delete(values[0]);
   return {rows: []};
 }};
 global.fetch = (url, options) => String(url).startsWith('https://identitytoolkit.googleapis.com/')
   ? Promise.resolve({ok: true, json: async () => ({users: [{localId: identity, email: identity, emailVerified: true}]})})
   : originalFetch(url, options);
 const app = express();
 app.use(express.json());
 app.use('/api/market', require('../lib/marketplace')(pool));
 const server = app.listen(0);
 await new Promise(resolve => server.once('listening', resolve));
 const request = (email, role) => originalFetch(`http://localhost:${server.address().port}/api/market/roles`, {
   method: 'PUT', headers: {Authorization: 'Bearer verified', 'Content-Type': 'application/json'}, body: JSON.stringify({email, role})
 });
 try {
   assert.equal((await request('new@example.com', 'ADMIN')).status, 403);
   identity = 'yuriyir57@gmail.com';
   assert.equal((await request('NEW@example.com', 'ADMIN')).status, 200);
   assert.equal(roles.get('new@example.com'), 'ADMIN');
   assert.equal((await request('yuriyir57@gmail.com', 'USER')).status, 400);
   assert.equal((await request('new@example.com', 'NPH')).status, 400);
   assert.equal((await request('new@example.com', 'USER')).status, 200);
   assert.equal(roles.has('new@example.com'), false);
   identity = 'new@example.com';
   assert.equal((await request('another@example.com', 'ADMIN')).status, 403);
 } finally {
   server.close(); global.fetch = originalFetch;
   if (originalKey === undefined) delete process.env.FIREBASE_WEB_API_KEY;
   else process.env.FIREBASE_WEB_API_KEY = originalKey;
 }
});

test('seller identity uses Creator profile and reflects later renames', async () => {
 const express=require('express'); const originalFetch=global.fetch, oldKey=process.env.FIREBASE_WEB_API_KEY;
 process.env.FIREBASE_WEB_API_KEY='test';
 let profiles=[{uid:'LYR-123',email:'OWNER@example.com',name:'Creator Name'}];
 let product={owner_id:'firebase-owner',seller_name:'Google Name',seller_profile_uid:null};
 const pool={query:async(sql,args)=>{
  if(sql.startsWith('SELECT db_data'))return {rows:[{db_data:profiles}]};
  if(sql.startsWith('SELECT role'))return {rows:[]};
  if(sql.startsWith('UPDATE lyrad_products')){assert.equal(args[0],'firebase-owner');product={...product,seller_profile_uid:args[1],seller_name:args[2]};return {rows:[]};}
  return {rows:[product]};
 }};
 global.fetch=(url,opts)=>String(url).startsWith('https://identitytoolkit.googleapis.com/')?Promise.resolve({ok:true,json:async()=>({users:[{localId:'firebase-owner',email:'owner@example.com',emailVerified:true,displayName:'Google Name'}]})}):originalFetch(url,opts);
 const app=express();app.use('/api/market',require('../lib/marketplace')(pool));const server=app.listen(0);await new Promise(r=>server.once('listening',r));const base=`http://localhost:${server.address().port}/api/market`;
 try {
  const actor=await (await originalFetch(base+'/me',{headers:{Authorization:'Bearer verified'}})).json();
  assert.equal(actor.name,'Creator Name');assert.equal(actor.profileUid,'LYR-123');assert.equal(actor.role,'USER');
  let rows=await (await originalFetch(base+'/products')).json();assert.equal(rows[0].seller_name,'Creator Name');
  profiles[0].name='Renamed Creator';rows=await (await originalFetch(base+'/products')).json();assert.equal(rows[0].seller_name,'Renamed Creator');
  profiles=[];rows=await (await originalFetch(base+'/products')).json();assert.equal(rows[0].seller_name,'Thành viên');
 }finally{server.close();global.fetch=originalFetch;if(oldKey===undefined)delete process.env.FIREBASE_WEB_API_KEY;else process.env.FIREBASE_WEB_API_KEY=oldKey;}
});
test('profile matching rejects ambiguous identities and does not fall back to Gmail',()=>{
 const {readProfiles,profileForEmail,profileName}=require('../lib/marketplace');
 assert.deepEqual(readProfiles('bad JSON'),[]);assert.deepEqual(readProfiles('{}'),[]);
 const users=[{uid:'a',email:'User@example.com',name:'Profile'}];
 assert.equal(profileForEmail(users,'user@example.com').uid,'a');
 assert.equal(profileForEmail([...users,...users],'user@example.com'),null);
 assert.equal(profileName(null),'Thành viên');assert.equal(profileName({name:'  '}),'Thành viên');
});

test('guest downloads warn once, lock for 30 seconds, and recover without extending the lock', async()=>{
 const express=require('express');let time=1000;const app=express();
 app.get('/file',require('../lib/marketplace').createDownloadGate(()=>time),(req,res)=>res.send('allowed'));
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));const url=`http://localhost:${server.address().port}/file`;
 try{
  const first=await fetch(url);assert.equal(first.status,401);const cookie=first.headers.get('set-cookie').split(';')[0];
  const second=await fetch(url,{headers:{Cookie:cookie}});assert.equal(second.status,429);assert.equal(second.headers.get('retry-after'),'30');
  time+=12000;const retry=await fetch(url,{headers:{Cookie:cookie,Authorization:'Bearer verified'}});assert.equal(retry.status,429);assert.equal(retry.headers.get('retry-after'),'18');
  const other=await fetch(url,{headers:{Authorization:'Bearer other'}});assert.equal(other.status,200);
  time+=18000;assert.equal((await fetch(url,{headers:{Cookie:cookie,Authorization:'Bearer verified'}})).status,200);
 }finally{server.close();}
});
test('direct catalog download requires a verified identity and preserves the original bytes',async()=>{
 const express=require('express');const originalFetch=global.fetch,oldKey=process.env.FIREBASE_WEB_API_KEY;process.env.FIREBASE_WEB_API_KEY='test';
 const bytes=Buffer.from('original binary');let reads=0;
 const pool={query:async(sql)=>{if(sql.startsWith('SELECT f.*')){reads++;return {rows:[{filename:'tool.rar',bytes}]};}return {rows:[]};}};
 global.fetch=(url,opts)=>String(url).startsWith('https://identitytoolkit.googleapis.com/')?Promise.resolve({ok:JSON.parse(opts.body).idToken==='valid',json:async()=>({users:[{localId:'user',email:'user@example.com',emailVerified:true}]})}):originalFetch(url,opts);
 const app=express();app.use('/api/market',require('../lib/marketplace')(pool));const server=app.listen(0);await new Promise(r=>server.once('listening',r));const url=`http://localhost:${server.address().port}/api/market/download/id`;
 try{
  assert.equal((await originalFetch(url)).status,401);assert.equal(reads,0);
  assert.equal((await originalFetch(url,{headers:{Authorization:'Bearer forged'}})).status,401);assert.equal(reads,0);
  const result=await originalFetch(url,{headers:{Authorization:'Bearer valid'}});assert.equal(result.status,200);assert.deepEqual(Buffer.from(await result.arrayBuffer()),bytes);assert.match(result.headers.get('cache-control'),/no-store/);
 }finally{server.close();global.fetch=originalFetch;if(oldKey===undefined)delete process.env.FIREBASE_WEB_API_KEY;else process.env.FIREBASE_WEB_API_KEY=oldKey;}
});

test('repeated guest attempts escalate to five minutes and reset after a day',async()=>{
 const express=require('express');let time=1000;const app=express();app.get('/file',require('../lib/marketplace').createDownloadGate(()=>time),(req,res)=>res.send('ok'));const server=app.listen(0);await new Promise(r=>server.once('listening',r));const url=`http://localhost:${server.address().port}/file`;
 try{
  const first=await fetch(url);const cookie=first.headers.get('set-cookie').split(';')[0];
  for(const seconds of [30,60,120,300,300]){const r=await fetch(url,{headers:{Cookie:cookie}});assert.equal(r.status,429);assert.equal(Number(r.headers.get('retry-after')),seconds);time+=seconds*1000;}
  time+=86400000;assert.equal((await fetch(url,{headers:{Cookie:cookie}})).status,401);
 }finally{server.close();}
});
