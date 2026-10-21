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
    return res.end(fs.readFileSync(path.join(__dirname, 'public', 'admin.html')));
  }
  send(res, 404, { error: 'Not found' });
}).listen(PORT, () => console.log('License server running on port ' + PORT));
