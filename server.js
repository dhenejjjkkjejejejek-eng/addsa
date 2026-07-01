const express = require('express');
const path = require('path');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/auth', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
app.use(express.static(path.join(__dirname, 'public')));

// ── Helper: HTTPS POST ───────────────────────────────────────
function httpsPost(hostname, path, body, headers={}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = {
      hostname, path, method: 'POST',
      headers: { 'Content-Length': Buffer.byteLength(data), ...headers }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── KeyAuth license check (no HWID) ─────────────────────────
app.post('/api/verify-key', async (req, res) => {
  const { key, discord } = req.body;
  if (!key) return res.json({ success: false, message: 'No key provided.' });

  try {
    // Step 1: init session
    const initBody = new URLSearchParams({
      type: 'init',
      name: 'Tiktok thingy',
      ownerid: '7XHJEUPgHh',
      ver: '1.0'
    }).toString();

    const initData = await httpsPost('keyauth.win', '/api/1.2/', initBody, {
      'Content-Type': 'application/x-www-form-urlencoded'
    });

    if (!initData.success) {
      return res.json({ success: false, message: 'Could not connect to license server.' });
    }

    const sessionid = initData.sessionid;

    // Step 2: license check (no hwid field = KeyAuth won't enforce it)
    const licBody = new URLSearchParams({
      type: 'license',
      name: 'Tiktok thingy',
      ownerid: '7XHJEUPgHh',
      ver: '1.0',
      sessionid,
      key
    }).toString();

    const licData = await httpsPost('keyauth.win', '/api/1.2/', licBody, {
      'Content-Type': 'application/x-www-form-urlencoded'
    });

    if (licData.success) {
      // Step 3: send Discord webhook
      const discordTag = discord || 'Unknown';
      const webhookBody = {
        embeds: [{
          title: '🎁 New Key Redeemed — Epic Gift Hub',
          color: 0x0670f0,
          fields: [
            { name: '🔑 Key', value: `\`${key}\``, inline: false },
            { name: '👤 Discord', value: discordTag, inline: true },
            { name: '📅 Time', value: new Date().toUTCString(), inline: true }
          ],
          footer: { text: 'Epic Gift Hub Key System' }
        }]
      };

      try {
        await httpsPost(
          'discord.com',
          '/api/webhooks/1521734450323390528/X9PTsd7T3kObDjXNGUyNE9DLTtaaM-MUhhP8c3aOxn2LNSQP7gx8VLSTpUWjpHXredK_',
          webhookBody,
          { 'Content-Type': 'application/json' }
        );
      } catch(e) { console.log('Webhook failed:', e.message); }
    }

    res.json(licData);

  } catch (e) {
    console.error('verify-key error:', e.message);
    res.json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── Game APIs ────────────────────────────────────────────────
const VBUCKS = [
  { id:800,   type:'vbucks', bucks:"800",    name:"800 V-Bucks",    price:"11.99", bonus:0,  color:"#0a8a3f", img:"https://cdn1.epicgames.com/offer/fn/EN_FNECO_41-00_RMT_CoreV-BucksPacks_800_EGS_Portrait_1200x1600_1200x1600-79529d8c20514e82ae2ebce58991b912" },
  { id:2400,  type:'vbucks', bucks:"2,400",  name:"2,400 V-Bucks",  price:"22.99", bonus:15, color:"#1d8de0", img:"https://cdn1.epicgames.com/offer/fn/EN_FNECO_41-00_RMT_CoreV-BucksPacks_2400_EGS_Portrait_1200x1600_1200x1600-30c1b26bd42b4d08a5cb4c1f6aa17332" },
  { id:4500,  type:'vbucks', bucks:"4,500",  name:"4,500 V-Bucks",  price:"36.99", bonus:26, color:"#8b3fc7", img:"https://cdn1.epicgames.com/offer/fn/EN_FNECO_41-00_RMT_CoreV-BucksPacks_4500_EGS_Portrait_1200x1600_1200x1600-c347ca38faa44fc998cc811342e67d80" },
  { id:12500, type:'vbucks', bucks:"12,500", name:"12,500 V-Bucks", price:"89.99", bonus:39, color:"#e08a1d", img:"https://cdn1.epicgames.com/offer/fn/EN_FNECO_41-00_RMT_CoreV-BucksPacks_12500_EGS_Portrait_1200x1600_1200x1600-070f17d0f6a34e9180b2927c8c24c40e" },
];
const COSMETICS = [
  { id:'galaxy',    type:'cosmetic', name:"Galaxy Skin",   price:"1,000.00", color:"#1d3a8e", img:"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQn6Hdu-jeh3quNZmAutaEtB3N0urxy-OgDzVIzTzJW-A&s=10", desc:"An exclusive Samsung Galaxy-themed Outfit. One of the rarest cosmetics in Fortnite history." },
  { id:'ikonik',    type:'cosmetic', name:"Ikonik Skin",   price:"1,000.00", color:"#7a1ee0", img:"https://www.digitaltrends.com/tachyon/2019/02/samsung-s10-plus-k-pop-skin-fortnite-2-1.jpg?fit=1180%2C787", desc:"Stand out with one of the most iconic outfits in Fortnite history." },
  { id:'minty',     type:'cosmetic', name:"Minty Axe",     price:"1,000.00", color:"#0fc864", img:"https://images.g2a.com/470x276/1x1x0/fortnite-minty-pickaxe-skin-epic-games-key-europe-i10000192306002/5def65df7e696c1c6f40a132", desc:"A legendary Harvesting Tool with a minty fresh touch." },
  { id:'travis',    type:'cosmetic', name:"Travis Scott",  price:"20.00",    color:"#1a0a2e", img:"https://preview.redd.it/lets-talk-about-travis-scott-v0-fjwssfraxqnd1.jpeg?auto=webp&s=cdfbcfd4efcb829ef6ef853dfa19fe145ffa11dc", desc:"The Astronomical Travis Scott Outfit from the iconic Fortnite concert event." },
  { id:'leviathan', type:'cosmetic', name:"Leviathan Axe", price:"30.00",    color:"#0d3a5c", img:"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSzqWJTB2dJG0zu0LE-4tXT4uG7u2gZmlgL0G6VMZKKcA&s=10", desc:"Wield the mythical Leviathan Axe Harvesting Tool." },
];
const ALL_ITEMS = [...VBUCKS, ...COSMETICS];

app.get('/api/items',       (req, res) => res.json(ALL_ITEMS));
app.get('/api/vbucks',      (req, res) => res.json(VBUCKS));
app.get('/api/cosmetics',   (req, res) => res.json(COSMETICS));

app.get('/api/find-player', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json(null);
  const colors = ['#1d8de0','#8b3fc7','#e08a1d','#0a8a3f','#e0395a'];
  const hash = q.split('').reduce((a,c) => a+c.charCodeAt(0), 0);
  setTimeout(() => res.json({ username:q, level:50+(hash%250), color:colors[hash%colors.length], initial:q[0].toUpperCase() }), 300);
});

app.post('/api/checkout', (req, res) => {
  setTimeout(() => {
    res.json({ success:true, transactionId:'PP-'+Math.random().toString(36).substr(2,7).toUpperCase(), date:new Date().toISOString(), merchant:'Epic Games, Inc.', ...req.body });
  }, 1600);
});

app.listen(PORT, () => console.log(`\n🎮 Epic Gift Hub → http://localhost:${PORT}\n`));
