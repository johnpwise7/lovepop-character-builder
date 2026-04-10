const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Uploads dir — use the same persistent volume as the DB when available
const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : null;
const UPLOADS_DIR = DATA_DIR
  ? path.join(DATA_DIR, 'uploads')
  : path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const uploadDisk = multer({ storage: diskStorage, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadMem  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '10mb' }));
// Serve uploads from the persistent volume at /uploads/ (takes priority over public/uploads/)
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ── Characters API ────────────────────────────────────────────
app.get('/api/characters', (req, res) => res.json(db.getAllCharacters()));
app.get('/api/characters/:id', (req, res) => {
  const row = db.getCharacter(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});
app.post('/api/characters', (req, res) => {
  try { res.status(201).json(db.createCharacter(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.put('/api/characters/:id', (req, res) => {
  try { res.json(db.updateCharacter(req.params.id, req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/characters/:id', (req, res) => {
  db.deleteCharacter(req.params.id);
  res.json({ success: true });
});
app.post('/api/characters/:id/images', uploadDisk.single('image'), (req, res) => {
  const char = db.getCharacter(req.params.id);
  if (!char) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const updated = db.updateCharacter(req.params.id, { images: [...char.images, `/uploads/${req.file.filename}`] });
  res.json(updated);
});
app.delete('/api/characters/:id/images/:index', (req, res) => {
  const char = db.getCharacter(req.params.id);
  if (!char) return res.status(404).json({ error: 'Not found' });
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= char.images.length) return res.status(400).json({ error: 'Invalid index' });
  const newImages = char.images.filter((_, i) => i !== idx);
  res.json(db.updateCharacter(req.params.id, { images: newImages }));
});

// ── Lands API ─────────────────────────────────────────────────
app.get('/api/lands', (req, res) => res.json(db.getAllLands()));
app.get('/api/lands/:id', (req, res) => {
  const row = db.getLand(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});
app.post('/api/lands', (req, res) => {
  try { res.status(201).json(db.createLand(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.put('/api/lands/:id', (req, res) => {
  try { res.json(db.updateLand(req.params.id, req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/lands/:id', (req, res) => {
  db.deleteLand(req.params.id);
  res.json({ success: true });
});
app.post('/api/lands/:id/images', uploadDisk.single('image'), (req, res) => {
  const land = db.getLand(req.params.id);
  if (!land) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const updated = db.updateLand(req.params.id, { images: [...land.images, `/uploads/${req.file.filename}`] });
  res.json(updated);
});
app.delete('/api/lands/:id/images/:index', (req, res) => {
  const land = db.getLand(req.params.id);
  if (!land) return res.status(404).json({ error: 'Not found' });
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= land.images.length) return res.status(400).json({ error: 'Invalid index' });
  const newImages = land.images.filter((_, i) => i !== idx);
  res.json(db.updateLand(req.params.id, { images: newImages }));
});

// ── Settings API ──────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const settings = db.getAllSettings();
  const apiKeySet = !!(process.env.ANTHROPIC_API_KEY || settings.anthropic_api_key);
  res.json({ ...settings, anthropic_api_key: undefined, api_key_configured: apiKeySet });
});
app.put('/api/settings', (req, res) => {
  db.setSettings(req.body);
  res.json({ success: true });
});
app.get('/api/settings/api-key-status', (req, res) => {
  const envKey = process.env.ANTHROPIC_API_KEY;
  const dbKey  = db.getSetting('anthropic_api_key');
  res.json({ configured: !!(envKey || dbKey), source: envKey ? 'env' : dbKey ? 'db' : 'none' });
});

// ── AI Generate — shared helper ───────────────────────────────
async function runAI({ req, res, fieldLabels, instructionPrefix }) {
  const apiKey = process.env.ANTHROPIC_API_KEY || db.getSetting('anthropic_api_key');
  if (!apiKey) return res.status(400).json({ error: 'Anthropic API key not configured.' });

  const anthropic = new Anthropic({ apiKey });
  const settings  = db.getAllSettings();
  const { description = '' } = req.body;

  // Wrap each field instruction in <…> so Claude reads them as placeholders,
  // not as the literal JSON value. This prevents it from returning the
  // instruction text as the value or skipping fields like key_passions.
  const schemaLines = Object.entries(fieldLabels).map(([key, label]) => {
    const instruction = settings[`${instructionPrefix}${key}`] || db.DEFAULTS[`${instructionPrefix}${key}`] || label;
    return `  "${key}": "<${instruction}>"`;
  }).join(',\n');

  const userContent = [];
  if (req.file) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: req.file.mimetype, data: req.file.buffer.toString('base64') } });
  }
  userContent.push({
    type: 'text',
    text: [
      description ? `Description / notes:\n${description}\n` : '',
      `Generate a profile as a JSON object using EXACTLY these field names.`,
      `Every value must be a plain string — never an array or nested object.`,
      `Replace each <…> placeholder with the generated content:`,
      `{\n${schemaLines}\n}`,
      `\nRespond with valid JSON only — no markdown fences, no extra text.`,
    ].filter(Boolean).join('\n'),
  });

  try {
    const response = await anthropic.messages.create({
      model: settings.ai_model || db.DEFAULTS.ai_model,
      max_tokens: 4096,   // raised from 2048 — verbose fields like backstory were consuming the budget before key_passions
      system: settings.ai_system_prompt || db.DEFAULTS.ai_system_prompt,
      messages: [{ role: 'user', content: userContent }],
    });
    const rawText = response.content[0].text.trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    const parsed = JSON.parse(jsonMatch[0]);

    // Safety-net: if Claude still returns an array or object for any field,
    // normalise it to a plain string so the UI can always render it.
    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key])) {
        parsed[key] = parsed[key].join('\n');
      } else if (parsed[key] !== null && typeof parsed[key] === 'object') {
        parsed[key] = Object.entries(parsed[key]).map(([k, v]) => `${k}. ${v}`).join('\n');
      }
    }

    res.json(parsed);
  } catch (err) {
    console.error('AI error:', err);
    res.status(500).json({ error: err.message || 'AI generation failed' });
  }
}

// Character generation
app.post('/api/ai/generate', uploadMem.single('image'), (req, res) =>
  runAI({ req, res, instructionPrefix: 'ai_instruction_', fieldLabels: {
    name: 'Name', species: 'Species', role: 'Role', backstory: 'Backstory',
    personality: 'Personality', key_passions: 'Key Passions',
    what_they_care_about: 'What They Care About', tone_and_voice: 'Tone & Voice',
  }})
);

// Land generation
app.post('/api/ai/generate-land', uploadMem.single('image'), (req, res) =>
  runAI({ req, res, instructionPrefix: 'ai_land_instruction_', fieldLabels: {
    name: 'Name', description: 'Description', visual_style: 'Visual Style',
    color_palette: 'Color Palette', themes_and_content: 'Themes & Content',
  }})
);

// ── Product Library Proxy ─────────────────────────────────────
let _productCache = null;
let _productCacheTs = 0;
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1 hour

app.get('/api/products', async (req, res) => {
  try {
    const now = Date.now();
    if (_productCache && (now - _productCacheTs) < PRODUCT_CACHE_TTL) {
      return res.json(_productCache);
    }
    const upstream = await fetch('https://lovepop-merch-tool-production.up.railway.app/api/products');
    if (!upstream.ok) throw new Error(`Upstream responded ${upstream.status}`);
    _productCache = await upstream.json();
    _productCacheTs = now;
    res.json(_productCache);
  } catch (err) {
    console.error('Products proxy error:', err.message);
    if (_productCache) return res.json(_productCache); // serve stale cache on upstream error
    res.status(502).json({ error: 'Could not load product library: ' + err.message });
  }
});

// Proxy Shopify CDN images so the browser avoids any CORS issues
app.get('/api/image-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith('https://cdn.shopify.com/')) {
    return res.status(400).json({ error: 'Only Shopify CDN URLs are allowed' });
  }
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error(`Image fetch failed: ${upstream.status}`);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Diagnostic
app.get('/api/debug/db-path', (req, res) => {
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'characters.db');
  res.json({
    db_path: dbPath,
    db_path_source: process.env.DB_PATH ? 'env var (good — persistent)' : 'local filesystem (bad — wiped on redeploy)',
    exists: fs.existsSync(dbPath),
    env_DB_PATH: process.env.DB_PATH || '(not set)',
  });
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'characters.db');
  console.log(`Lovepop Character Builder → http://localhost:${PORT}`);
  console.log(`DB_PATH env var: ${process.env.DB_PATH || '(not set — using local filesystem)'}`);
  console.log(`Database location: ${dbPath}`);
  console.log(`Database exists: ${fs.existsSync(dbPath)}`);
  console.log(`Uploads directory: ${UPLOADS_DIR}`);
  console.log(`Uploads dir exists: ${fs.existsSync(UPLOADS_DIR)}`);
  console.log(`/data directory exists: ${fs.existsSync('/data')}`);
});
