const express = require('express');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { minify } = require('html-minifier-terser');
const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_SECRET = process.env.SESSION_SECRET || 'egh-s3cr3t-k3y-2024-xQ9pLmZv';
const VALID_SESSIONS = new Map();

// Minify options — collapses everything into one unreadable line
const MINIFY_OPTS = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  minifyCSS: true,
  minifyJS: true,
  collapseInlineTagWhitespace: true,
  conservativeCollapse: false,
  html5: true,
};

// Cache minified versions at startup
let _indexHtml = null;
let _authHtml = null;

async function getMinified(file) {
  const raw = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
  return await minify(raw, MINIFY_OPTS);
}

async function initMinified() {
  _indexHtml = await getMinified('index.html');
  _authHtml  = await getMinified('auth.html');
  console.log('✓ HTML minified and cached');
}

// Clean expired sessions
setInterval(() => {
  const now = Date.now();
  for(const [t,d] of VALID_SESSIONS) if(d.expires < now) VALID_SESSIONS.delete(t);
}, 10 * 60 * 1000);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper
function httpsPost(hostname, urlPath, body, headers={}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = { hostname, path: urlPath, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(data), ...headers } };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

function generateToken(key, discord) {
  const payload = `${key}:${discord}:${Date.now()}:${Math.random()}`;
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'];
  if(!token || !VALID_SESSIONS.has(token)) return res.status(401).json({ success:false, message:'Unauthorized' });
  const s = VALID_SESSIONS.get(token);
  if(s.expires < Date.now()) { VALID_SESSIONS.delete(token); return res.status(401).json({ success:false, message:'Session expired' }); }
  req.session = s; next();
}

function sendHtml(res, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.send(html);
}

// ── Routes ───────────────────────────────────────────────────
app.get('/favicon.ico', (req,res) => res.sendFile(path.join(__dirname,'public','favicon.ico')));

app.get('/auth', (req,res) => sendHtml(res, _authHtml));

// Block direct source access
app.get('/index.html', (req,res) => res.redirect('/auth'));
app.get('/auth.html',  (req,res) => res.redirect('/auth'));

app.get('/', (req,res) => {
  const token = req.query._t;
  if(!token || !VALID_SESSIONS.has(token)) return res.redirect('/auth');
  const s = VALID_SESSIONS.get(token);
  if(s.expires < Date.now()) { VALID_SESSIONS.delete(token); return res.redirect('/auth'); }
  sendHtml(res, _indexHtml);
});

// Static (CSS/images only — HTML blocked above)
app.use(express.static(path.join(__dirname,'public'), { index:false, extensions:[] }));

// ── KeyAuth ───────────────────────────────────────────────────
app.post('/api/verify-key', async (req,res) => {
  const { key, discord } = req.body;
  if(!key) return res.json({ success:false, message:'No key provided.' });
  if(!discord) return res.json({ success:false, message:'Discord username required.' });

  // Rate limit 5/min per IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x';
  if(!app._rl) app._rl = new Map();
  const now = Date.now();
  const rl = app._rl.get(ip) || { n:0, r:now+60000 };
  if(rl.r < now) { rl.n=0; rl.r=now+60000; }
  if(++rl.n > 5) { app._rl.set(ip,rl); return res.json({ success:false, message:'Too many attempts. Wait 1 minute.' }); }
  app._rl.set(ip,rl);

  try {
    const initBody = new URLSearchParams({ type:'init', name:'Tiktok thingy', ownerid:'7XHJEUPgHh', ver:'1.0' }).toString();
    const initData = await httpsPost('keyauth.win','/api/1.2/',initBody,{'Content-Type':'application/x-www-form-urlencoded'});
    if(!initData.success) return res.json({ success:false, message:'Could not reach license server.' });

    const licBody = new URLSearchParams({ type:'license', name:'Tiktok thingy', ownerid:'7XHJEUPgHh', ver:'1.0', sessionid:initData.sessionid, key }).toString();
    const licData = await httpsPost('keyauth.win','/api/1.2/',licBody,{'Content-Type':'application/x-www-form-urlencoded'});

    if(licData.success) {
      const token = generateToken(key, discord);
      VALID_SESSIONS.set(token, { discord, key, expires: Date.now() + 24*60*60*1000 });
      try {
        await httpsPost('discord.com',
          '/api/webhooks/1521734450323390528/X9PTsd7T3kObDjXNGUyNE9DLTtaaM-MUhhP8c3aOxn2LNSQP7gx8VLSTpUWjpHXredK_',
          { embeds:[{ title:'🎁 New Key Redeemed — Epic Gift Hub', color:0x0670f0, fields:[
            { name:'🔑 Key', value:`\`${key}\``, inline:false },
            { name:'👤 Discord', value:discord, inline:true },
            { name:'📅 Time', value:new Date().toUTCString(), inline:true }
          ], footer:{ text:'Epic Gift Hub Key System' } }] },
          {'Content-Type':'application/json'}
        );
      } catch(e) { console.log('Webhook error:', e.message); }
      res.json({ success:true, token });
    } else {
      res.json({ success:false, message:(licData.message||'Invalid key.').replace(/<[^>]+>/g,'') });
    }
  } catch(e) {
    console.error('verify-key error:', e.message);
    res.json({ success:false, message:'Server error. Try again.' });
  }
});

// ── Protected APIs ────────────────────────────────────────────
const VBUCKS = [
  { id:800,   type:'vbucks', bucks:"800",    name:"800 V-Bucks",   price:"11.99", bonus:0,  color:"#0a8a3f", img:"https://cdn1.epicgames.com/offer/fn/EN_FNECO_41-00_RMT_CoreV-BucksPacks_800_EGS_Portrait_1200x1600_1200x1600-79529d8c20514e82ae2ebce58991b912" },
  { id:2400,  type:'vbucks', bucks:"2,400",  name:"2,400 V-Bucks", price:"22.99", bonus:15, color:"#1d8de0", img:"https://cdn1.epicgames.com/offer/fn/EN_FNECO_41-00_RMT_CoreV-BucksPacks_2400_EGS_Portrait_1200x1600_1200x1600-30c1b26bd42b4d08a5cb4c1f6aa17332" },
  { id:4500,  type:'vbucks', bucks:"4,500",  name:"4,500 V-Bucks", price:"36.99", bonus:26, color:"#8b3fc7", img:"https://cdn1.epicgames.com/offer/fn/EN_FNECO_41-00_RMT_CoreV-BucksPacks_4500_EGS_Portrait_1200x1600_1200x1600-c347ca38faa44fc998cc811342e67d80" },
  { id:12500, type:'vbucks', bucks:"12,500", name:"12,500 V-Bucks",price:"89.99", bonus:39, color:"#e08a1d", img:"https://cdn1.epicgames.com/offer/fn/EN_FNECO_41-00_RMT_CoreV-BucksPacks_12500_EGS_Portrait_1200x1600_1200x1600-070f17d0f6a34e9180b2927c8c24c40e" },
];
const COSMETICS = [
  { id:'galaxy',    type:'cosmetic', name:"Galaxy Skin",   price:"1,000.00", color:"#1d3a8e", img:"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQn6Hdu-jeh3quNZmAutaEtB3N0urxy-OgDzVIzTzJW-A&s=10", desc:"An exclusive Samsung Galaxy-themed Outfit." },
  { id:'ikonik',    type:'cosmetic', name:"Ikonik Skin",   price:"1,000.00", color:"#7a1ee0", img:"https://www.digitaltrends.com/tachyon/2019/02/samsung-s10-plus-k-pop-skin-fortnite-2-1.jpg?fit=1180%2C787", desc:"Stand out with one of the most iconic outfits in Fortnite history." },
  { id:'minty',     type:'cosmetic', name:"Minty Axe",     price:"1,000.00", color:"#0fc864", img:"https://images.g2a.com/470x276/1x1x0/fortnite-minty-pickaxe-skin-epic-games-key-europe-i10000192306002/5def65df7e696c1c6f40a132", desc:"A legendary Harvesting Tool with a minty fresh touch." },
  { id:'travis',    type:'cosmetic', name:"Travis Scott",  price:"20.00",    color:"#1a0a2e", img:"https://preview.redd.it/lets-talk-about-travis-scott-v0-fjwssfraxqnd1.jpeg?auto=webp&s=cdfbcfd4efcb829ef6ef853dfa19fe145ffa11dc", desc:"The Astronomical Travis Scott Outfit." },
  { id:'leviathan', type:'cosmetic', name:"Leviathan Axe", price:"30.00",    color:"#0d3a5c", img:"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSzqWJTB2dJG0zu0LE-4tXT4uG7u2gZmlgL0G6VMZKKcA&s=10", desc:"Wield the mythical Leviathan Axe Harvesting Tool." },
];
const ALL_ITEMS = [...VBUCKS, ...COSMETICS];

app.get('/api/items',       requireAuth, (req,res) => res.json(ALL_ITEMS));
app.get('/api/vbucks',      requireAuth, (req,res) => res.json(VBUCKS));
app.get('/api/cosmetics',   requireAuth, (req,res) => res.json(COSMETICS));
app.get('/api/find-player', requireAuth, (req,res) => {
  const q=(req.query.q||'').trim();
  if(!q) return res.json(null);
  const colors=['#1d8de0','#8b3fc7','#e08a1d','#0a8a3f','#e0395a'];
  const h=q.split('').reduce((a,c)=>a+c.charCodeAt(0),0);
  setTimeout(()=>res.json({ username:q, level:50+(h%250), color:colors[h%colors.length], initial:q[0].toUpperCase() }),300);
});
app.post('/api/checkout', requireAuth, (req,res) => {
  setTimeout(()=>res.json({ success:true, transactionId:'PP-'+Math.random().toString(36).substr(2,7).toUpperCase(), date:new Date().toISOString(), merchant:'Epic Games, Inc.', ...req.body }),1600);
});

// Start after minifying
initMinified().then(()=>{
  app.listen(PORT, ()=>console.log(`\n🎮 Epic Gift Hub → http://localhost:${PORT}\n`));
});
