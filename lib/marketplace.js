const express = require('express');
const crypto = require('crypto');
const NPH_EMAIL = 'yuriyir57@gmail.com';
const MAX_FILE = 32 * 1024 * 1024;
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
module.exports = function marketplace(pool) {
  const router = express.Router();
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
    req.actor={id:u.localId,email:u.email.toLowerCase(),name:u.displayName || u.email,role:roles.rows[0]?.role || 'USER'};
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
  router.get('/products',wrap(async(req,res)=>res.json((await pool.query(`SELECT ${columns} FROM lyrad_products p JOIN lyrad_market_files f ON f.id=p.file_id WHERE p.status='approved' ORDER BY p.created_at DESC`)).rows)));
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
  router.get('/mine',signed,wrap(async(req,res)=>res.json((await pool.query(`SELECT ${columns} FROM lyrad_products p JOIN lyrad_market_files f ON f.id=p.file_id WHERE p.owner_id=$1 ORDER BY p.created_at DESC`,[req.actor.id])).rows)));
  router.post('/files',signed,wrap(async(req,res)=>{
    const {filename,platform,base64}=req.body;
    const ext={android:'.apk',windows:'.exe'}[platform];
    if(!ext || typeof filename!=='string' || filename.length>200 || !filename.toLowerCase().endsWith(ext) || typeof base64!=='string' || base64.length>Math.ceil(MAX_FILE/3)*4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return res.status(400).json({error:'Chọn đúng file APK/EXE, tối đa 32 MB.'});
    const bytes=Buffer.from(base64,'base64');
    if(!bytes.length || bytes.length>MAX_FILE || (platform==='windows' ? bytes.subarray(0,2).toString()!=='MZ' : bytes.subarray(0,4).toString('hex')!=='504b0304')) return res.status(400).json({error:'Nội dung file không đúng định dạng.'});
    const usage=await pool.query('SELECT coalesce(sum(octet_length(bytes)),0) AS n FROM lyrad_market_files WHERE owner_id=$1',[req.actor.id]);
    if(Number(usage.rows[0].n)+bytes.length>128*1024*1024) return res.status(413).json({error:'Tài khoản đã đạt giới hạn lưu trữ 128 MB.'});
    const id=crypto.randomUUID(), sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    await pool.query('INSERT INTO lyrad_market_files(id,owner_id,filename,platform,sha256,bytes) VALUES($1,$2,$3,$4,$5,$6)',[id,req.actor.id,filename,platform,sha256,bytes]);res.json({id,sha256});
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
      const values=[id,req.actor.id,req.actor.name,b.name.trim(),b.description,b.platform,b.category,b.kind,b.price,b.payment_method,b.contact,b.file_id,status];
      await client.query(`INSERT INTO lyrad_products(id,owner_id,seller_name,name,description,platform,category,kind,price,payment_method,contact,file_id,status) VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,platform=EXCLUDED.platform,category=EXCLUDED.category,price=EXCLUDED.price,payment_method=EXCLUDED.payment_method,contact=EXCLUDED.contact,file_id=EXCLUDED.file_id,status=EXCLUDED.status,review_note='',updated_at=now()`,values);
      await client.query('INSERT INTO lyrad_product_history(product_id,actor_id,status,note) VALUES($1,$2,$3,$4)',[id,req.actor.id,status,editing?'Đã sửa và gửi lại':'Đăng mới']);
      await client.query('COMMIT');res.json({id,status});
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  router.post('/products',signed,wrap((req,res)=>save(req,res,false)));
  router.put('/products/:id',signed,wrap((req,res)=>save(req,res,true)));
  router.get('/review',signed,privileged,locked,wrap(async(req,res)=>res.json((await pool.query(`SELECT ${columns} FROM lyrad_products p JOIN lyrad_market_files f ON f.id=p.file_id ORDER BY p.created_at DESC`)).rows)));
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
  router.get('/download/:id',wrap(async(req,res)=>{
    const r=await pool.query("SELECT f.* FROM lyrad_products p JOIN lyrad_market_files f ON f.id=p.file_id WHERE p.id=$1 AND p.status='approved' AND p.kind='catalog'",[req.params.id]);
    if(!r.rows[0])return res.status(404).json({error:'Không có bản tải công khai.'});sendFile(res,r.rows[0]);
  }));
  router.get('/review-file/:id',signed,privileged,locked,wrap(async(req,res)=>{const r=await pool.query('SELECT f.* FROM lyrad_products p JOIN lyrad_market_files f ON f.id=p.file_id WHERE p.id=$1',[req.params.id]);if(!r.rows[0])return res.sendStatus(404);sendFile(res,r.rows[0]);}));
  router.use((err,req,res,next)=>{console.error('Marketplace:',err.code || err.name);res.status(err.code==='42P01'?503:400).json({error:err.code==='42P01'?'Chưa chạy migration 002_marketplace.sql.':err.code?'Không thể lưu dữ liệu. Vui lòng kiểm tra và thử lại.':err.message});});
  return router;
};
function sendFile(res,f){res.setHeader('Content-Type','application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(f.filename));res.send(f.bytes);}
module.exports.validateProduct=validateProduct;module.exports.nextReview=nextReview;
