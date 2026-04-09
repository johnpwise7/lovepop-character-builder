const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'characters.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    story TEXT DEFAULT '',
    tagline TEXT DEFAULT '',
    images TEXT DEFAULT '[]',
    products TEXT DEFAULT '[]',
    quotes TEXT DEFAULT '[]',
    art_styles TEXT DEFAULT '[]',
    personality_traits TEXT DEFAULT '[]',
    first_appeared TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

const parseJSON = (val, fallback = []) => {
  try { return JSON.parse(val); } catch { return fallback; }
};

const serializeCharacter = (row) => ({
  ...row,
  images: parseJSON(row.images),
  products: parseJSON(row.products),
  quotes: parseJSON(row.quotes),
  art_styles: parseJSON(row.art_styles),
  personality_traits: parseJSON(row.personality_traits),
});

module.exports = {
  getAllCharacters() {
    return db.prepare('SELECT * FROM characters ORDER BY created_at DESC').all().map(serializeCharacter);
  },

  getCharacter(id) {
    const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    return row ? serializeCharacter(row) : null;
  },

  createCharacter(data) {
    const stmt = db.prepare(`
      INSERT INTO characters (name, story, tagline, images, products, quotes, art_styles, personality_traits, first_appeared, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.name || '',
      data.story || '',
      data.tagline || '',
      JSON.stringify(data.images || []),
      JSON.stringify(data.products || []),
      JSON.stringify(data.quotes || []),
      JSON.stringify(data.art_styles || []),
      JSON.stringify(data.personality_traits || []),
      data.first_appeared || '',
      data.status || 'active'
    );
    return this.getCharacter(result.lastInsertRowid);
  },

  updateCharacter(id, data) {
    const fields = [];
    const values = [];
    const allowed = ['name', 'story', 'tagline', 'images', 'products', 'quotes', 'art_styles', 'personality_traits', 'first_appeared', 'status'];
    const jsonFields = new Set(['images', 'products', 'quotes', 'art_styles', 'personality_traits']);

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(jsonFields.has(key) ? JSON.stringify(data[key]) : data[key]);
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
};
