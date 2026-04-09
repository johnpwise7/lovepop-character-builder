const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'characters.db');
const db = new DatabaseSync(DB_PATH);

// Characters table
db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    species TEXT DEFAULT '',
    role TEXT DEFAULT '',
    backstory TEXT DEFAULT '',
    personality TEXT DEFAULT '',
    key_passions TEXT DEFAULT '',
    what_they_care_about TEXT DEFAULT '',
    tone_and_voice TEXT DEFAULT '',
    images TEXT DEFAULT '[]',
    products TEXT DEFAULT '[]',
    quotes TEXT DEFAULT '[]',
    art_styles TEXT DEFAULT '[]',
    first_appeared TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migrate: add new columns if they don't exist (for existing DBs)
const existingCols = db.prepare("PRAGMA table_info(characters)").all().map(r => r.name);
const newCols = { species: 'TEXT DEFAULT ""', role: 'TEXT DEFAULT ""', backstory: 'TEXT DEFAULT ""', personality: 'TEXT DEFAULT ""', key_passions: 'TEXT DEFAULT ""', what_they_care_about: 'TEXT DEFAULT ""', tone_and_voice: 'TEXT DEFAULT ""' };
for (const [col, def] of Object.entries(newCols)) {
  if (!existingCols.includes(col)) {
    db.exec(`ALTER TABLE characters ADD COLUMN ${col} ${def}`);
  }
}

// Settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// Default AI settings
const DEFAULTS = {
  ai_system_prompt: `You are a creative character designer for Lovepop, a premium pop-up greeting card and gifting company known for beautiful, intricate paper art. Your job is to help bring Lovepop characters to life with warmth, whimsy, and depth. Characters should feel charming, distinct, and deeply aligned with Lovepop's brand of spreading joy through beautifully crafted moments. Always respond with valid JSON only — no markdown, no extra text.`,

  ai_instruction_name: `The character's full name. Keep it warm, memorable, and evocative. Single word or short two-word names work best.`,
  ai_instruction_species: `The character's species or type (e.g. "field mouse", "honey bee", "woodland fox"). Be specific and charming.`,
  ai_instruction_role: `A one-sentence description of the character's role or purpose in the Lovepop world (e.g. "the unofficial birthday-wish muse of Lovepop Land").`,
  ai_instruction_backstory: `2-4 sentences describing the character's origin story — where they came from, a formative moment, and what shaped who they are today. Should feel storybook-warm.`,
  ai_instruction_personality: `2-3 sentences describing the character's disposition, quirks, and how they engage with the world. Include at least one unexpected or delightful detail.`,
  ai_instruction_key_passions: `List 3 core passions or hobbies, each with a brief (1 sentence) explanation of why it matters to this character. Number them 1, 2, 3.`,
  ai_instruction_what_they_care_about: `1-2 sentences capturing the character's deepest values and what motivates them at their core — the "why" behind everything they do.`,
  ai_instruction_tone_and_voice: `Describe how the character speaks: their tone, cadence, vocabulary quirks, signature phrases, and overall communication style. Include an example quote.`,

  ai_model: 'claude-opus-4-5',
};

for (const [key, value] of Object.entries(DEFAULTS)) {
  const existing = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

// ─── Helpers ────────────────────────────────────────────────
const parseJSON = (val, fallback = []) => { try { return JSON.parse(val); } catch { return fallback; } };

const serializeChar = (row) => ({
  ...row,
  images: parseJSON(row.images),
  products: parseJSON(row.products),
  quotes: parseJSON(row.quotes),
  art_styles: parseJSON(row.art_styles),
});

const TEXT_FIELDS = ['name', 'species', 'role', 'backstory', 'personality', 'key_passions', 'what_they_care_about', 'tone_and_voice', 'first_appeared', 'status'];
const JSON_FIELDS = ['images', 'products', 'quotes', 'art_styles'];
const ALL_FIELDS = [...TEXT_FIELDS, ...JSON_FIELDS];

module.exports = {
  // ── Characters ──────────────────────────────────────────
  getAllCharacters() {
    return db.prepare('SELECT * FROM characters ORDER BY created_at DESC').all().map(serializeChar);
  },

  getCharacter(id) {
    const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    return row ? serializeChar(row) : null;
  },

  createCharacter(data) {
    const cols = ALL_FIELDS.join(', ');
    const placeholders = ALL_FIELDS.map(() => '?').join(', ');
    const values = ALL_FIELDS.map(f =>
      JSON_FIELDS.includes(f) ? JSON.stringify(data[f] || []) : (data[f] || '')
    );
    const result = db.prepare(`INSERT INTO characters (${cols}) VALUES (${placeholders})`).run(...values);
    return this.getCharacter(result.lastInsertRowid);
  },

  updateCharacter(id, data) {
    const fields = []; const values = [];
    for (const key of ALL_FIELDS) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(JSON_FIELDS.includes(key) ? JSON.stringify(data[key]) : data[key]);
      }
    }
    if (!fields.length) return this.getCharacter(id);
    fields.push(`updated_at = datetime('now')`);
    values.push(id);
    db.prepare(`UPDATE characters SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getCharacter(id);
  },

  deleteCharacter(id) {
    return db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  },

  // ── Settings ─────────────────────────────────────────────
  getAllSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },

  getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : (DEFAULTS[key] || '');
  },

  setSetting(key, value) {
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, value);
  },

  setSettings(obj) {
    for (const [key, value] of Object.entries(obj)) this.setSetting(key, value);
  },

  DEFAULTS,
};
