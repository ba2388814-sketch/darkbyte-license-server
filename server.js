// DARK BYTE license server - zero dependencies (Node 18+)
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASS) { console.error('ERROR: set ADMIN_PASSWORD environment variable'); process.exit(1); }
const SECRET = process.env.SESSION_SECRET || ADMIN_PASS + '|darkbyte';

// ---- storage: JSON file. On Render attach a Disk and set DATA_DIR=/var/data ----
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DIR, { recursive: true });
const FILE = path.join(DIR, 'licenses.json');
let db = { keys: {} };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
const save = () => { fs.writeFileSync(FILE + '.tmp', JSON.stringify(db)); fs.renameSync(FILE + '.tmp', FILE); };

// ---- admin page (embedded, no extra file needed) ----
const ADMIN_HTML = "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>DARK BYTE License Admin</title>\n<style>\n*{box-sizing:border-box}body{margin:0;background:#050a14;color:#e6f0ff;font-family:Arial,sans-serif;padding:16px}\n.wrap{max-width:1000px;margin:auto}h1{color:#00e5ff;font-size:20px}\n.card{background:#0a1730;border:1px solid #17406e;border-radius:12px;padding:16px;margin-bottom:14px}\ninput,button{font:inherit;padding:9px 11px;border-radius:8px;border:1px solid #1f5287;background:#07122a;color:#fff}\nbutton{cursor:pointer;background:#0866d8;border:0}button.red{background:#c0392b}button.gray{background:#33486b}\n.row{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.row label{font-size:12px;color:#9ab2d5;display:block;margin-bottom:3px}\ntable{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px 6px;border-bottom:1px solid #17406e;text-align:left}\n.key{font-family:monospace;color:#00e5ff}.ok{color:#00d99a}.bad{color:#ff6b6b}.tw{overflow-x:auto}\n#msg{margin:8px 0;color:#ffd166;font-size:13px;word-break:break-all}.hide{display:none}\n</style></head><body><div class=\"wrap\">\n<h1>♛ DARK BYTE — License Admin</h1>\n<div id=\"login\" class=\"card\"><div class=\"row\">\n <div><label>Username</label><input id=\"u\" value=\"admin\"></div>\n <div><label>Password</label><input id=\"p\" type=\"password\"></div>\n <button id=\"lb\">Login</button></div><div id=\"lm\" class=\"bad\"></div></div>\n<div id=\"app\" class=\"hide\">\n <div class=\"card\"><div class=\"row\">\n  <div><label>Customer name</label><input id=\"nm\" placeholder=\"optional\"></div>\n  <div><label>Days valid (0 = forever)</label><input id=\"dy\" type=\"number\" value=\"30\" min=\"0\" style=\"width:110px\"></div>\n  <div><label>Max devices</label><input id=\"md\" type=\"number\" value=\"1\" min=\"1\" style=\"width:90px\"></div>\n  <div><label>How many keys</label><input id=\"ct\" type=\"number\" value=\"1\" min=\"1\" max=\"100\" style=\"width:90px\"></div>\n  <button id=\"cb\">Create key(s)</button><button class=\"gray\" id=\"lo\">Logout</button></div>\n  <div id=\"msg\"></div></div>\n <div class=\"card tw\"><table><thead><tr><th>Key</th><th>Name</th><th>Status</th><th>Expires</th><th>Devices</th><th>Last used</th><th>Actions</th></tr></thead><tbody id=\"tb\"></tbody></table></div>\n</div></div>\n<script>\nlet T=sessionStorage.getItem('t')||'';const $=i=>document.getElementById(i);\nasync function api(m,u,b){const r=await fetch(u,{method:m,headers:{'Content-Type':'application/json',Authorization:'Bearer '+T},body:b?JSON.stringify(b):undefined});\n if(r.status===401&&u!=='/admin/api/login'){logout();throw new Error('Session expired')}const j=await r.json();if(!r.ok)throw new Error(j.error||'Error');return j}\nfunction show(on){$('login').classList.toggle('hide',on);$('app').classList.toggle('hide',!on)}\nfunction logout(){T='';sessionStorage.removeItem('t');show(false)}\nconst fd=t=>t?new Date(t).toLocaleString():'—';\nasync function load(){const ks=await api('GET','/admin/api/keys');const tb=$('tb');tb.innerHTML='';\n ks.forEach(k=>{const tr=document.createElement('tr');const exp=k.expiresAt&&k.expiresAt<Date.now();\n  const st=k.disabled?['Disabled','bad']:exp?['Expired','bad']:['Active','ok'];\n  const cells=[[k.key,'key'],[k.name||'—'],[st[0],st[1]],[k.expiresAt?fd(k.expiresAt):'Never'],[k.devices.length+'/'+k.maxDevices],[fd(k.lastUsed)]];\n  cells.forEach(c=>{const td=document.createElement('td');td.textContent=c[0];if(c[1])td.className=c[1];tr.appendChild(td)});\n  const td=document.createElement('td');\n  [['Copy','gray',()=>navigator.clipboard.writeText(k.key)],\n   [k.disabled?'Enable':'Disable','gray',async()=>{await api('PATCH','/admin/api/keys/'+k.key,{disabled:!k.disabled});load()}],\n   ['Reset devices','gray',async()=>{await api('PATCH','/admin/api/keys/'+k.key,{resetDevices:true});load()}],\n   ['Delete','red',async()=>{if(confirm('Delete '+k.key+' permanently?')){await api('DELETE','/admin/api/keys/'+k.key);load()}}]\n  ].forEach(([l,c,f])=>{const b=document.createElement('button');b.textContent=l;b.className=c;b.style.margin='2px';b.onclick=f;td.appendChild(b)});\n  tr.appendChild(td);tb.appendChild(tr)})}\n$('lb').onclick=async()=>{try{const j=await api('POST','/admin/api/login',{username:$('u').value,password:$('p').value});T=j.token;sessionStorage.setItem('t',T);show(true);load()}catch(e){$('lm').textContent=e.message}};\n$('cb').onclick=async()=>{try{const j=await api('POST','/admin/api/keys',{name:$('nm').value,days:$('dy').value,maxDevices:$('md').value,count:$('ct').value});\n $('msg').textContent='Created: '+j.created.join('  ');load()}catch(e){$('msg').textContent=e.message}};\n$('lo').onclick=logout;\nif(T){show(true);load().catch(()=>{})}\n</script></body></html>\n";

// ---- helpers ----
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('hex');
const makeToken = () => { const exp = Date.now() + 12 * 3600e3; return exp + '.' + sign(String(exp)); };
const okToken = t => { const [exp, sig] = String(t || '').split('.'); return !!(exp && sig && Date.now() < +exp && eq(sig, sign(exp))); };
const genKey = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.randomBytes(12);
  const p = i => [...r.subarray(i, i + 4)].map(b => c[b % c.length]).join(''); return `DB-${p(0)}-${p(4)}-${p(8)}`; };
const hits = {};
const limited = (name, ip, max, ms) => { const k = name + ip, now = Date.now(); hits[k] = (hits[k] || []).filter(t => now - t < ms);
  if (hits[k].length >= max) return true; hits[k].push(now); return false; };

const send = (res, code, obj, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...extra }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise(resolve => { let d = ''; req.on('data', c => { d += c; if (d.length > 20000) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } }); });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST,GET,OPTIONS' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname, ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  // ---------- public API (used by the extension) ----------
  if (p.startsWith('/api/')) {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (p === '/api/ping') return send(res, 200, { ok: true }, CORS);
    if (p === '/api/verify' && req.method === 'POST') {
      if (limited('v', ip, 30, 60e3)) return send(res, 429, { valid: false, message: 'Too many requests' }, CORS);
      const b = await readBody(req), key = String(b.key || '').trim().toUpperCase(), dev = String(b.deviceId || '').slice(0, 128), k = db.keys[key];
      if (!k) return send(res, 200, { valid: false, message: 'Invalid license key' }, CORS);   // deleted keys end up here
      if (k.disabled) return send(res, 200, { valid: false, message: 'License disabled' }, CORS);
      if (k.expiresAt && Date.now() > k.expiresAt) return send(res, 200, { valid: false, message: 'License expired' }, CORS);
      if (dev && !k.devices.includes(dev)) {
        if (k.devices.length >= k.maxDevices) return send(res, 200, { valid: false, message: 'Device limit reached' }, CORS);
        k.devices.push(dev);
      }
      k.lastUsed = Date.now(); save();
      return send(res, 200, { valid: true, message: 'License active', name: k.name, expiresAt: k.expiresAt || null }, CORS);
    }
    return send(res, 404, { error: 'Not found' }, CORS);
  }

  // ---------- admin API ----------
  if (p === '/admin/api/login' && req.method === 'POST') {
    if (limited('l', ip, 8, 15 * 60e3)) return send(res, 429, { error: 'Too many attempts, try later' });
    const b = await readBody(req);
    if (eq(b.username || '', ADMIN_USER) && eq(b.password || '', ADMIN_PASS)) return send(res, 200, { token: makeToken() });
    return send(res, 401, { error: 'Wrong username or password' });
  }
  if (p.startsWith('/admin/api/')) {
    if (!okToken((req.headers.authorization || '').replace('Bearer ', ''))) return send(res, 401, { error: 'Unauthorized' });
    const m = p.match(/^\/admin\/api\/keys(?:\/([A-Za-z0-9-]+))?$/);
    if (!m) return send(res, 404, { error: 'Not found' });
    if (!m[1] && req.method === 'GET')
      return send(res, 200, Object.entries(db.keys).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.createdAt - a.createdAt));
    if (!m[1] && req.method === 'POST') {
      const b = await readBody(req), n = Math.min(Math.max(parseInt(b.count) || 1, 1), 100), days = parseInt(b.days) || 0,
        max = Math.min(Math.max(parseInt(b.maxDevices) || 1, 1), 100), out = [];
      for (let i = 0; i < n; i++) { let key; do { key = genKey(); } while (db.keys[key]);
        db.keys[key] = { name: String(b.name || '').slice(0, 60), createdAt: Date.now(), expiresAt: days ? Date.now() + days * 864e5 : null, maxDevices: max, devices: [], disabled: false, lastUsed: null };
        out.push(key); }
      save(); return send(res, 200, { created: out });
    }
    const k = db.keys[m[1]];
    if (m[1] && !k) return send(res, 404, { error: 'Not found' });
    if (m[1] && req.method === 'PATCH') { const b = await readBody(req);
      if (typeof b.disabled === 'boolean') k.disabled = b.disabled; if (b.resetDevices) k.devices = [];
      save(); return send(res, 200, { ok: true }); }
    if (m[1] && req.method === 'DELETE') { delete db.keys[m[1]]; save(); return send(res, 200, { ok: true }); }
    return send(res, 405, { error: 'Method not allowed' });
  }

  // ---------- admin page ----------
  if (p === '/' || p === '/admin' || p === '/admin.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(ADMIN_HTML);
  }
  send(res, 404, { error: 'Not found' });
}).listen(PORT, () => console.log('License server running on port ' + PORT));
