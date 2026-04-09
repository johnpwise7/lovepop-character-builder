const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

// GET all characters
app.get('/api/characters', (req, res) => {
  res.json(db.getAllCharacters());
});

// GET single character
app.get('/api/characters/:id', (req, res) => {
  const char = db.getCharacter(req.params.id);
  if (!char) return res.status(404).json({ error: 'Not found' });
  res.json(char);
});

// POST create character
app.post('/api/characters', (req, res) => {
  try {
    const char = db.createCharacter(req.body);
    res.status(201).json(char);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update character
app.put('/api/characters/:id', (req, res) => {
  try {
    const char = db.updateCharacter(req.params.id, req.body);
    res.json(char);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE character
app.delete('/api/characters/:id', (req, res) => {
  db.deleteCharacter(req.params.id);
  res.json({ success: true });
});

// POST upload image for a character
app.post('/api/characters/:id/images', upload.single('image'), async (req, res) => {
  const char = db.getCharacter(req.params.id);
  if (!char) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const url = `/uploads/${req.file.filename}`;
  const images = [...char.images, url];
  const updated = db.updateCharacter(req.params.id, { images });
  res.json(updated);
});

// Serve SPA for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Lovepop Character Builder running on http://localhost:${PORT}`);
});
