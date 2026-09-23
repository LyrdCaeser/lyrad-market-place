const express = require('express');
const crypto = require('crypto');
const NPH_EMAIL = 'yuriyir57@gmail.com';
const MAX_FILE = 80 * 1024 * 1024;
const MAX_ICON = 5 * 1024 * 1024;
const FILE_SIGNATURES={'.apk':['504b0304'],'.exe':['4d5a'],'.zip':['504b0304','504b0506','504b0708'],'.rar':['526172211a0700','526172211a070100'],'.7z':['377abcaf271c']};
function normalizeVersion(value) {
  const version=typeof value==='string'?value.trim():'';
  if(!version || version.length>40 || !/^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(version)) throw new Error('Phiên bản chỉ gồm chữ, số, dấu chấm, gạch ngang, gạch dưới hoặc dấu cộng; tối đa 40 ký tự.');
  return version;
}
function normalizeIconData(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_ICON / 3) * 4 + 64) throw new Error('Ảnh đại diện tối đa 5 MB.');
  const match=value.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match)throw new Error('Ảnh đại diện chỉ hỗ trợ PNG, JPG, WEBP hoặc GIF.');
  const bytes=Buffer.from(match[2],'base64');
  if(!bytes.length||bytes.length>MAX_ICON)throw new Error('Ảnh đại diện tối đa 5 MB.');
  const hex=bytes.subarray(0,12).toString('hex');
  const valid=match[1]==='image/png'?hex.startsWith('89504e470d0a1a0a'):
    match[1]==='image/jpeg'?hex.startsWith('ffd8ff'):
    match[1]==='image/gif'?bytes.subarray(0,6).toString('ascii').match(/^GIF8[79]a$/):
    bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP';
  if(!valid)throw new Error('Nội dung ảnh đại diện không đúng định dạng.');
  return `data:${match[1]};base64,${match[2]}`;
}
function decodeInstallerBytes(filename,platform,bytes) {
  const installerExt={android:'.apk',windows:'.exe'}[platform];
  const ext=typeof filename==='string' ? filename.toLowerCase().match(/\.[^.]+$/)?.[0] : '';
  if(!installerExt || typeof filename!=='string' || filename.length>200 || ![installerExt,'.zip','.rar','.7z'].includes(ext) || !Buffer.isBuffer(bytes)) throw new Error('Chọn APK (Mobile), EXE (PC) hoặc ZIP, RAR, 7Z, tối đa 80 MB.');
  if(!bytes.length || bytes.length>MAX_FILE || !FILE_SIGNATURES[ext].some(signature=>bytes.subarray(0,signature.length/2).toString('hex')===signature)) throw new Error('Nội dung file không đúng định dạng.');
  return {bytes,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
function decodeInstaller(filename,platform,base64) {
  if(typeof base64!=='string' || base64.length>Math.ceil(MAX_FILE/3)*4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('Chọn APK (Mobile), EXE (PC) hoặc ZIP, RAR, 7Z, tối đa 80 MB.');
  return decodeInstallerBytes(filename,platform,Buffer.from(base64,'base64'));
}
function binaryUpload(req) {
  if (!Buffer.isBuffer(req.body)) return null;
  let filename='';
  try { filename=decodeURIComponent(String(req.headers['x-lyrad-filename'] || '')); } catch { throw new Error('Tên tệp không hợp lệ.'); }
  return {filename,platform:String(req.headers['x-lyrad-platform'] || ''),bytes:req.body};
}
async function scanWithLaa({filename,bytes,sha256,version='1.0.0'}) {
  const base=String(process.env.LAA_SANDBOX_URL || '').replace(/\/$/,'');
  const key=process.env.LAA_SCAN_KEY;
  const fallback=message=>({status:'completed',is_safe:false,verdict:'error',risk_level:'ERROR',safety_score:0,scan_id:'LAA-UNAVAILABLE',engine:'LAA Sandbox',sha256,checks:[],risks:[message],message:'ERROR · Điểm an toàn 0/100 vì máy quét không hoàn tất. Đây chỉ là cảnh báo, không chặn đăng tệp.'});
  if(!base || !key)return fallback('Máy quét LAA Sandbox chưa được cấu hình.');
  const form=new FormData();
  form.append('apk_file',new Blob([bytes]),filename);
  form.append('app_name',filename.replace(/\.[^.]+$/,''));
  form.append('app_version',version);
  form.append('local_sha256',sha256);
  let response;
  try{
    response=await fetch(base+'/v1/sandbox/scan',{method:'POST',headers:{'X-LAA-Scan-Key':key},body:form,signal:AbortSignal.timeout(180000)});
  }catch(cause){return fallback('Không thể kết nối máy quét LAA Sandbox.');}
  const result=await response.json().catch(()=>({}));
  if(!response.ok)return fallback(result.message || result.detail || 'LAA Sandbox từ chối yêu cầu quét.');
  if(result.sha256!==sha256)return fallback('LAA trả về SHA-256 không khớp tệp gốc.');
  const score=Number(result.safety_score);
  return {...result,safety_score:Number.isFinite(score)?Math.max(0,Math.min(100,score)):0,risk_level:['SAFE','WARNING','ERROR','DANGEROUS'].includes(result.risk_level)?result.risk_level:'ERROR'};
}
function validateProduct(b) {
  for (const [key, max] of Object.entries({name:160,description:10000,payment_method:2000,contact:1000})) {
    if (typeof b[key] !== 'string' || b[key].length > max) throw new Error('Thông tin sản phẩm không hợp lệ: ' + key);
  }
  if (!b.name.trim() || !['android','windows'].includes(b.platform) || !['app','game'].includes(b.category) || !['sale','catalog'].includes(b.kind)) throw new Error('Kiểm tra tên, nền tảng và danh mục.');
  if (!Number.isFinite(Number(b.price)) || Number(b.price)<0 || Number(b.price)>999999999999.99) throw new Error('Giá không hợp lệ.');
  if (b.kind==='sale' && (!b.payment_method.trim() || !b.contact.trim())) throw new Error('Nhập phương thức thanh toán và liên hệ.');
}
function nextReview(product, status) {
  if (product.status !== 'pending') throw new Error('Bài đã được xử lý. Hãy tải lại.');
  if (!['approved','rejected','returned'].includes(status)) throw new Error('Trạng thái không hợp lệ.');
  if (status==='returned' && product.return_count>=1) throw new Error('Chỉ được trả về sửa một lần.');
}
function readProfiles(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return []; } }
  return Array.isArray(value) ? value : [];
}
function profileForEmail(profiles, email) {
  const matches = profiles.filter(p => typeof p.email === 'string' && p.email.trim().toLowerCase() === email.toLowerCase());
  return matches.length === 1 && typeof matches[0].uid === 'string' ? matches[0] : null;
}
function profileName(profile) {
  return typeof profile?.name === 'string' && profile.name.trim() ? profile.name.trim() : 'Thành viên';
}
// A browser-scoped cooldown; authentication is always checked separately.
function createDownloadGate(now = Date.now) {
  const attempts = new Map();
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    let id = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('lyrad_download='))?.slice(15);
    if (!id || !attempts.has(id)) {
      id = crypto.randomUUID();
      res.cookie('lyrad_download', id, {httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/api/market', maxAge:86400000});
    }
    const time = now();
    for (const [key, value] of attempts) if (value.expires <= time) attempts.delete(key);
    const state = attempts.get(id);
    if (state?.until > time) {
      const seconds = Math.ceil((state.until-time)/1000);
      res.setHeader('Retry-After', String(seconds));
      return res.status(429).json({error:'Tạm khóa tải xuống. Vui lòng chờ hết thời gian.', retryAfter:seconds});
    }
    if (!/^Bearer \S+$/i.test(req.headers.authorization || '')) {
      if (state?.warned) {
        const strikes = (state.strikes || 0) + 1;
        const seconds = [30,60,120,300][Math.min(strikes-1,3)];
        attempts.set(id, {warned:true, strikes, until:time+seconds*1000, expires:time+86400000});
        res.setHeader('Retry-After',String(seconds));
        return res.status(429).json({error:'Bạn tiếp tục tải khi chưa đăng nhập. Tạm khóa tải xuống.', retryAfter:seconds});
      }
      if (attempts.size >= 10000) attempts.delete(attempts.keys().next().value);
      attempts.set(id, {warned:true, strikes:0, expires:time+86400000});
      return res.status(401).json({error:'Vui lòng đăng nhập trước khi tải. Tiếp tục bấm tải khi chưa đăng nhập sẽ bị khóa tải 30 giây.'});
    }
    attempts.delete(id);
    next();
  };
}
module.exports = function marketplace(pool) {
  const router = express.Router();
  async function profiles() {
    const result = await pool.query("SELECT db_data FROM lyrad_db_storage WHERE db_key='lyrad_real_users'");
    return readProfiles(result.rows[0]?.db_data);
  }
  async function withProfileNames(rows) {
    const byId = new Map((await profiles()).map(p => [p.uid, p]));
    return rows.map(p => ({...p, seller_name: profileName(byId.get(p.seller_profile_uid))}));
  }
  const wrap = fn => async(req,res,next) => {try {await fn(req,res);} catch(e) {next(e);}};
  const auth = wrap(async(req,res) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /,'');
    if (!token) return res.status(401).json({error:'Vui lòng đăng nhập Google.'});
    const key=process.env.FIREBASE_WEB_API_KEY;
    if(!key) return res.status(503).json({error:'Máy chủ chưa cấu hình FIREBASE_WEB_API_KEY.'});
    const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(10000)});
    const data=await r.json(); const u=data.users?.[0];
    if(!r.ok || !u || !u.emailVerified || u.disabled) return res.status(401).json({error:'Phiên đăng nhập không hợp lệ.'});
    const roles=await pool.query('SELECT role FROM lyrad_market_roles WHERE email=$1',[u.email.toLowerCase()]);
    const profile = profileForEmail(await profiles(), u.email);
    req.actor={id:u.localId,email:u.email.toLowerCase(),name:profileName(profile),profileUid:profile?.uid || null,role:roles.rows[0]?.role || 'USER'};
    if (profile) await pool.query('UPDATE lyrad_products SET seller_profile_uid=$2, seller_name=$3 WHERE owner_id=$1 AND (seller_profile_uid IS DISTINCT FROM $2 OR seller_name IS DISTINCT FROM $3)', [u.localId, profile.uid, req.actor.name]);
    if (req.actor.role === 'NPH' && req.actor.email !== NPH_EMAIL) req.actor.role = 'USER';
    req.marketNext();
  });
  function signed(req,res,next){req.marketNext=next;auth(req,res,next);}
  function privileged(req,res,next){if(!['ADMIN','NPH'].includes(req.actor.role)) return res.status(403).json({error:'Chỉ Admin/NPH có quyền này.'});next();}
  const attempts=new Map();
  function locked(req,res,next){
    const now=Date.now(), entry=attempts.get(req.actor.id) || {count:0,until:now+60000};
    if(entry.until<now){entry.count=0;entry.until=now+60000;}
    if(entry.count>=5) return res.status(429).json({error:'Thử lại sau một phút.'});
    const actual=process.env.PRODUCT_REVIEW_KEY;
    if(!actual) return res.status(503).json({error:'Chưa cấu hình khóa kiểm duyệt.'});
    const digest=x=>crypto.createHash('sha256').update(x).digest();
    if(!crypto.timingSafeEqual(digest(String(req.headers['x-review-key'] || '')),digest(actual))){entry.count++;attempts.set(req.actor.id,entry);return res.status(403).json({error:'Khóa kiểm duyệt không đúng.'});}
    attempts.delete(req.actor.id);next();
  }
  const columns='p.*, f.filename, f.sha256, octet_length(f.bytes) AS file_size';
  router.get('/products',wrap(async(req,res)=>res.json(await withProfileNames((await pool.query(`SELECT ${columns} FROM lyrad_products p JOIN lyrad_market_files f ON f.id=p.file_id WHERE p.status='approved' ORDER BY p.created_at DESC`)).rows))));
  router.get('/me',signed,wrap(async(req,res)=>res.json(req.actor)));
  // Role changes are exclusively controlled by the verified publisher account.
  function publisherOnly(req, res, next) {
    if (req.actor.role !== 'NPH' || req.actor.email !== NPH_EMAIL) {
      return res.status(403).json({error: 'Chỉ NPH được cấp hoặc thu hồi quyền Admin.'});
    }
    next();
  }
  router.get('/roles', signed, publisherOnly, wrap(async (req, res) => {
    const result = await pool.query('SELECT email, role FROM lyrad_market_roles ORDER BY email');
    res.json(result.rows);
  }));
  router.put('/roles', signed, publisherOnly, wrap(async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const role = req.body.role;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !['ADMIN', 'USER'].includes(role)) {
      return res.status(400).json({error: 'Nhập email đăng nhập Google và chọn ADMIN hoặc USER.'});
    }
    if (email === NPH_EMAIL) {
      return res.status(400).json({error: 'Không thể thay đổi quyền của tài khoản NPH.'});
    }
    if (role === 'ADMIN') {
      await pool.query(
        "INSERT INTO lyrad_market_roles(email,role) VALUES($1,'ADMIN') ON CONFLICT(email) DO UPDATE SET role='ADMIN'",
        [email]
      );
    } else {
      await pool.query("DELETE FROM lyrad_market_roles WHERE email=$1 AND role='ADMIN'", [email]);
    }
    res.json({email, role});
  }));
  router.get('/mine',signed,wrap(async(req,res)=>res.json(await withProfileNames((await pool.query(`SELECT ${columns} FROM lyrad_products p JOIN lyrad_market_files f ON f.id=p.file_id WHERE p.owner_id=$1 ORDER BY p.created_at DESC`,[req.actor.id])).rows))));
  router.post('/files',express.raw({type:'application/octet-stream',limit:MAX_FILE}),signed,wrap(async(req,res)=>{
    const binary=binaryUpload(req), filename=binary?.filename ?? req.body.filename, platform=binary?.platform ?? req.body.platform;
    const {bytes,sha256}=binary?decodeInstallerBytes(filename,platform,binary.bytes):decodeInstaller(filename,platform,req.body.base64);
    const scan=await scanWithLaa({filename,bytes,sha256});
    const usage=await pool.query('SELECT coalesce(sum(octet_length(bytes)),0) AS n FROM lyrad_market_files WHERE owner_id=$1',[req.actor.id]);
    if(Number(usage.rows[0].n)+bytes.length>128*1024*1024) return res.status(413).json({error:'Tài khoản đã đạt giới hạn lưu trữ 128 MB.'});
    const id=crypto.randomUUID();
    await pool.query('INSERT INTO lyrad_market_files(id,owner_id,filename,platform,sha256,bytes) VALUES($1,$2,$3,$4,$5,$6)',[id,req.actor.id,filename,platform,sha256,bytes]);res.json({id,sha256,scan});
  }));
  async function save(req,res,editing){
    const b=req.body;validateProduct(b);
    const trusted=['ADMIN','NPH'].includes(req.actor.role);
    if(b.kind==='catalog'&&!trusted)return res.status(403).json({error:'Đăng tải kho ứng dụng dành cho Admin/NPH.'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');let old;
      if(editing){old=(await client.query('SELECT * FROM lyrad_products WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
        if(!old || old.owner_id!==req.actor.id || old.status!=='returned')throw new Error('Chỉ chủ bài được sửa bài đã trả về.');
        if(b.kind!==old.kind)throw new Error('Không thể đổi loại bài.');}
      const file=(await client.query('SELECT id FROM lyrad_market_files WHERE id=$1 AND owner_id=$2 AND platform=$3',[b.file_id,req.actor.id,b.platform])).rows[0];
      if(!file)throw new Error('File không tồn tại hoặc không thuộc tài khoản/nền tảng này.');
      const id=editing?old.id:crypto.randomUUID(), status=editing?'pending':trusted?'approved':'pending';
      const version=b.kind==='catalog'?normalizeVersion(b.version || old?.version || '1.0.0'):'1.0.0';
      const iconData=b.kind==='catalog'?normalizeIconData(b.icon_data ?? old?.icon_data ?? ''):'';
      const values=[id,req.actor.id,req.actor.name,b.name.trim(),b.description,b.platform,b.category,b.kind,b.price,b.payment_method,b.contact,b.file_id,status,req.actor.profileUid,version,iconData];
      await client.query(`INSERT INTO lyrad_products(id,owner_id,seller_name,name,description,platform,category,kind,price,payment_method,contact,file_id,status,seller_profile_uid,version,icon_data) VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(id) DO UPDATE SET seller_name=EXCLUDED.seller_name,seller_profile_uid=EXCLUDED.seller_profile_uid,name=EXCLUDED.name,description=EXCLUDED.description,platform=EXCLUDED.platform,category=EXCLUDED.category,price=EXCLUDED.price,payment_method=EXCLUDED.payment_method,contact=EXCLUDED.contact,file_id=EXCLUDED.file_id,status=EXCLUDED.status,review_note='',version=EXCLUDED.version,icon_data=EXCLUDED.icon_data,updated_at=now()`,values);
      await client.query('INSERT INTO lyrad_product_history(product_id,actor_id,status,note) VALUES($1,$2,$3,$4)',[id,req.actor.id,status,editing?'Đã sửa và gửi lại':'Đăng mới']);
      await client.query('COMMIT');res.json({id,status});
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  router.post('/products',signed,wrap((req,res)=>save(req,res,false)));
  router.put('/products/:id',signed,wrap((req,res)=>save(req,res,true)));
  router.put('/products/:id/icon',signed,privileged,wrap(async(req,res)=>{
    const iconData=normalizeIconData(req.body.icon_data);
    if(!iconData)return res.status(400).json({error:'Chọn ảnh đại diện từ thư viện máy.'});
    const result=await pool.query("UPDATE lyrad_products SET icon_data=$2,updated_at=now() WHERE id=$1 AND kind='catalog' AND (owner_id=$3 OR $4='NPH') RETURNING id",[req.params.id,iconData,req.actor.id,req.actor.role]);
    if(!result.rows[0])return res.status(404).json({error:'Không tìm thấy App/Game thuộc tài khoản này.'});
    res.json({id:result.rows[0].id,updated:true});
  }));
  router.post('/products/:id/version',express.raw({type:'application/octet-stream',limit:MAX_FILE}),signed,privileged,wrap(async(req,res)=>{
    const binary=binaryUpload(req);
    const version=normalizeVersion(binary?String(req.headers['x-lyrad-version'] || ''):req.body.version);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const product=(await client.query('SELECT * FROM lyrad_products WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
      if(!product || product.kind!=='catalog' || product.status!=='approved') throw new Error('Chỉ có thể cập nhật ứng dụng/trò chơi đã đăng công khai.');
      if(version===product.version) throw new Error('Phiên bản mới phải khác phiên bản hiện tại.');
      const filename=binary?.filename ?? req.body.filename;
      const {bytes,sha256}=binary?decodeInstallerBytes(filename,product.platform,binary.bytes):decodeInstaller(filename,product.platform,req.body.base64);
      const scan=await scanWithLaa({filename,bytes,sha256,version});
      const usage=await client.query('SELECT coalesce(sum(octet_length(bytes)),0) AS n FROM lyrad_market_files WHERE owner_id=$1 AND id<>$2',[req.actor.id,product.file_id]);
      if(Number(usage.rows[0].n)+bytes.length>128*1024*1024){await client.query('ROLLBACK');return res.status(413).json({error:'Tài khoản đã đạt giới hạn lưu trữ 128 MB.'});}
      const fileId=crypto.randomUUID();
      await client.query('INSERT INTO lyrad_market_files(id,owner_id,filename,platform,sha256,bytes) VALUES($1,$2,$3,$4,$5,$6)',[fileId,req.actor.id,filename,product.platform,sha256,bytes]);
      await client.query('UPDATE lyrad_products SET file_id=$2,version=$3,updated_at=now() WHERE id=$1',[product.id,fileId,version]);
      await client.query('INSERT INTO lyrad_product_history(product_id,actor_id,status,note) VALUES($1,$2,$3,$4)',[product.id,req.actor.id,'approved',`Cập nhật phiên bản ${product.version} → ${version}`]);
      await client.query('DELETE FROM lyrad_market_files old_file WHERE old_file.id=$1 AND NOT EXISTS (SELECT 1 FROM lyrad_products product WHERE product.file_id=old_file.id)',[product.file_id]);
      await client.query('COMMIT');
      res.json({id:product.id,version,filename,sha256,file_size:bytes.length,scan});
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }));
  router.get('/review',signed,privileged,locked,wrap(async(req,res)=>res.json(await withProfileNames((await pool.query(`SELECT ${columns} FROM lyrad_products p JOIN lyrad_market_files f ON f.id=p.file_id ORDER BY p.created_at DESC`)).rows))));
  router.post('/review/:id',signed,privileged,locked,wrap(async(req,res)=>{
    const {status,note=''}=req.body;if(typeof note!=='string'||note.length>2000 || (status!=='approved'&&!note.trim()))return res.status(400).json({error:'Nhập lý do (tối đa 2000 ký tự).'});
    const c=await pool.connect();try{await c.query('BEGIN');const p=(await c.query('SELECT * FROM lyrad_products WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!p)throw new Error('Không tìm thấy bài.');nextReview(p,status);
      await c.query("UPDATE lyrad_products SET status=$2,review_note=$3,return_count=return_count+CASE WHEN $2='returned' THEN 1 ELSE 0 END,updated_at=now() WHERE id=$1",[p.id,status,note]);
      await c.query('INSERT INTO lyrad_product_history(product_id,actor_id,status,note) VALUES($1,$2,$3,$4)',[p.id,req.actor.id,status,note]);await c.query('COMMIT');res.json({success:true});
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }));
  router.get('/history',signed,privileged,locked,wrap(async(req,res)=>res.json((await pool.query('SELECT h.*,p.name FROM lyrad_product_history h JOIN lyrad_products p ON p.id=h.product_id ORDER BY h.created_at DESC')).rows)));
  router.delete('/history',signed,privileged,locked,wrap(async(req,res)=>{await pool.query('DELETE FROM lyrad_product_history');res.json({success:true});}));
  // File bài bán chỉ dành cho người bán và người kiểm duyệt. Giao hàng/thanh toán do hai bên thỏa thuận.
  router.get('/download/:id',createDownloadGate(),signed,wrap(async(req,res)=>{
    const r=await pool.query("WITH target AS (UPDATE lyrad_products SET download_count=download_count+1 WHERE id=$1 AND status='approved' AND kind='catalog' RETURNING file_id) SELECT f.* FROM target JOIN lyrad_market_files f ON f.id=target.file_id",[req.params.id]);
    if(!r.rows[0])return res.status(404).json({error:'Không có bản tải công khai.'});sendFile(res,r.rows[0]);
  }));
  router.get('/review-file/:id',signed,privileged,locked,wrap(async(req,res)=>{const r=await pool.query('SELECT f.* FROM lyrad_products p JOIN lyrad_market_files f ON f.id=p.file_id WHERE p.id=$1',[req.params.id]);if(!r.rows[0])return res.sendStatus(404);sendFile(res,r.rows[0]);}));
  router.use((err,req,res,next)=>{console.error('Marketplace:',err.code || err.name);const tooLarge=err.type==='entity.too.large';const status=tooLarge?413:(err.status || (err.code==='42P01'?503:400));res.status(status).json({error:tooLarge?'Tệp vượt giới hạn 80 MB.':err.code==='42P01'?'Chưa chạy migration 002_marketplace.sql.':err.code?'Không thể lưu dữ liệu. Vui lòng kiểm tra và thử lại.':err.message,scan:err.scan});});
  return router;
};
function sendFile(res,f){res.setHeader('Content-Type','application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(f.filename));res.send(f.bytes);}
module.exports.validateProduct=validateProduct;module.exports.nextReview=nextReview;

module.exports.readProfiles=readProfiles;module.exports.profileForEmail=profileForEmail;module.exports.profileName=profileName;

module.exports.createDownloadGate=createDownloadGate;
module.exports.normalizeVersion=normalizeVersion;module.exports.decodeInstaller=decodeInstaller;module.exports.decodeInstallerBytes=decodeInstallerBytes;
module.exports.normalizeIconData=normalizeIconData;
module.exports.scanWithLaa=scanWithLaa;module.exports.MAX_FILE=MAX_FILE;
