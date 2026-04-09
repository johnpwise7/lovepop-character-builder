/* ============================================================
   Lovepop Character Builder — Frontend App
   ============================================================ */

const API = '/api/characters';
let characters = [];
let currentView = 'catalog';
let displayMode = 'tile';
let activeDetailId = null;
let editorMode = 'create'; // 'create' | 'edit'
let editorCharId = null;
let aiGeneratedData = {};
let aiImageFile = null;

const FIELD_META = [
  { key: 'name',               label: 'Name',                 inputId: 'f-name' },
  { key: 'species',            label: 'Species',              inputId: 'f-species' },
  { key: 'role',               label: 'Role',                 inputId: 'f-role' },
  { key: 'backstory',          label: 'Backstory',            inputId: 'f-backstory' },
  { key: 'personality',        label: 'Personality',          inputId: 'f-personality' },
  { key: 'key_passions',       label: 'Key Passions',         inputId: 'f-key-passions' },
  { key: 'what_they_care_about', label: 'What They Care About', inputId: 'f-what-they-care-about' },
  { key: 'tone_and_voice',     label: 'Tone & Voice',         inputId: 'f-tone-and-voice' },
];

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindNav();
  bindCatalog();
  bindBuild();
  bindEditor();
  bindAIPanel();
  bindDetailModal();
  bindSettings();
  loadCharacters();
  checkApiKeyStatus();
});

// ── Navigation ────────────────────────────────────────────────
function bindNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });
}

function switchView(view) {
  if (view === currentView) return;
  currentView = view;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  if (view === 'build')    renderBuildRecent();
  if (view === 'settings') loadSettings();
}

function openEditorView(mode, charId = null) {
  editorMode = mode;
  editorCharId = charId;
  aiGeneratedData = {};
  aiImageFile = null;
  clearAIPanel();

  if (mode === 'edit' && charId) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    document.getElementById('editor-title').textContent = char.name;
    populateEditorForm(char);
  } else {
    document.getElementById('editor-title').textContent = 'New Character';
    clearEditorForm();
  }

  document.getElementById('editor-save-status').textContent = '';
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-editor').classList.add('active');
  currentView = 'editor';
  window.scrollTo(0, 0);
}

// ── Characters Data ───────────────────────────────────────────
async function loadCharacters() {
  try {
    const res = await fetch(API);
    characters = await res.json();
    renderCatalog();
    renderBuildRecent();
  } catch (err) { console.error('Load error:', err); }
}

async function saveCharacter(data) {
  if (editorMode === 'edit' && editorCharId) {
    const res = await fetch(`${API}/${editorCharId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Update failed');
    return res.json();
  } else {
    const res = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Create failed');
    return res.json();
  }
}

// ── Catalog ───────────────────────────────────────────────────
function bindCatalog() {
  document.getElementById('btn-tile-view').addEventListener('click', () => setDisplayMode('tile'));
  document.getElementById('btn-list-view').addEventListener('click', () => setDisplayMode('list'));
  document.getElementById('catalog-new-btn').addEventListener('click', () => openEditorView('create'));
  document.getElementById('empty-new-btn').addEventListener('click', () => openEditorView('create'));
}

function setDisplayMode(mode) {
  displayMode = mode;
  document.getElementById('btn-tile-view').classList.toggle('active', mode === 'tile');
  document.getElementById('btn-list-view').classList.toggle('active', mode === 'list');
  document.getElementById('tile-view').classList.toggle('hidden', mode !== 'tile');
  document.getElementById('list-view').classList.toggle('hidden', mode !== 'list');
}

function renderCatalog() {
  const n = characters.length;
  document.getElementById('catalog-count').textContent = `${n} character${n !== 1 ? 's' : ''}`;
  renderTileView();
  renderListView();
}

function renderTileView() {
  const grid = document.getElementById('tile-view');
  const empty = document.getElementById('catalog-empty');
  Array.from(grid.children).forEach(el => { if (el.id !== 'catalog-empty') el.remove(); });
  if (!characters.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  characters.forEach(char => grid.appendChild(buildTile(char)));
}

function renderListView() {
  const tbody = document.getElementById('list-body');
  const empty = document.getElementById('list-empty');
  tbody.innerHTML = '';
  if (!characters.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  characters.forEach(char => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="list-char-name">${esc(char.name)}</div>
        ${char.species ? `<div class="list-char-sub">${esc(char.species)}</div>` : ''}
      </td>
      <td><span class="list-meta">${esc(char.role || '—')}</span></td>
      <td><span class="status-badge status-${char.status}">${cap(char.status)}</span></td>
      <td><span class="list-meta">${esc(char.first_appeared || '—')}</span></td>
      <td><span class="list-meta">${fmtDate(char.created_at)}</span></td>
      <td style="text-align:right"><button class="btn-secondary" style="font-size:11px;padding:4px 10px">View →</button></td>
    `;
    tr.addEventListener('click', () => openDetailModal(char.id));
    tbody.appendChild(tr);
  });
}

function buildTile(char) {
  const tile = document.createElement('div');
  tile.className = 'character-tile';
  const imgHtml = char.images && char.images.length
    ? `<img src="${esc(char.images[0])}" alt="${esc(char.name)}" loading="lazy" />`
    : `<div class="tile-image-placeholder">✨</div>`;
  tile.innerHTML = `
    <div class="tile-image">
      ${imgHtml}
      <span class="tile-status-badge status-badge status-${char.status}">${cap(char.status)}</span>
    </div>
    <div class="tile-body">
      <div class="tile-name">${esc(char.name)}</div>
      ${char.species || char.role ? `<div class="tile-sub">${esc([char.species, char.role].filter(Boolean).join(' · '))}</div>` : ''}
    </div>
  `;
  tile.addEventListener('click', () => openDetailModal(char.id));
  return tile;
}

// ── Build ─────────────────────────────────────────────────────
function bindBuild() {
  document.getElementById('build-new-btn').addEventListener('click', () => openEditorView('create'));
}

function renderBuildRecent() {
  const section = document.getElementById('build-recent-section');
  const grid = document.getElementById('build-recent-grid');
  grid.innerHTML = '';
  const recent = characters.slice(0, 6);
  if (!recent.length) { section.classList.remove('visible'); return; }
  section.classList.add('visible');
  recent.forEach(char => grid.appendChild(buildTile(char)));
}

// ── Editor ────────────────────────────────────────────────────
function bindEditor() {
  document.getElementById('editor-back-btn').addEventListener('click', () => {
    const dest = editorMode === 'edit' ? 'catalog' : 'catalog';
    switchView(dest);
    // Re-activate the catalog tab visually
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === dest));
  });
  document.getElementById('editor-cancel-btn').addEventListener('click', () => {
    switchView('catalog');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'catalog'));
  });
  document.getElementById('editor-save-btn').addEventListener('click', handleEditorSave);
}

function clearEditorForm() {
  FIELD_META.forEach(f => { const el = document.getElementById(f.inputId); if (el) el.value = ''; });
  document.getElementById('f-status').value = 'active';
  document.getElementById('f-first-appeared').value = '';
}

function populateEditorForm(char) {
  FIELD_META.forEach(f => {
    const el = document.getElementById(f.inputId);
    if (el) el.value = char[f.key] || '';
  });
  document.getElementById('f-status').value = char.status || 'active';
  document.getElementById('f-first-appeared').value = char.first_appeared || '';
}

function readEditorForm() {
  const data = {};
  FIELD_META.forEach(f => {
    const el = document.getElementById(f.inputId);
    if (el) data[f.key] = el.value.trim();
  });
  data.status = document.getElementById('f-status').value;
  data.first_appeared = document.getElementById('f-first-appeared').value.trim();
  return data;
}

async function handleEditorSave() {
  const data = readEditorForm();
  if (!data.name) {
    document.getElementById('f-name').focus();
    document.getElementById('f-name').style.borderColor = 'var(--coral)';
    setTimeout(() => document.getElementById('f-name').style.borderColor = '', 1500);
    return;
  }

  const btn = document.getElementById('editor-save-btn');
  const status = document.getElementById('editor-save-status');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const saved = await saveCharacter(data);
    if (editorMode === 'edit') {
      characters = characters.map(c => c.id === saved.id ? saved : c);
    } else {
      characters.unshift(saved);
    }
    renderCatalog();
    renderBuildRecent();
    status.textContent = '✓ Saved';
    setTimeout(() => {
      switchView('catalog');
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'catalog'));
    }, 600);
  } catch (err) {
    alert('Save failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Character';
  }
}

// ── AI Panel ──────────────────────────────────────────────────
function bindAIPanel() {
  const zone = document.getElementById('ai-image-zone');
  const input = document.getElementById('ai-image-input');
  const placeholder = document.getElementById('ai-image-placeholder');
  const preview = document.getElementById('ai-image-preview');
  const clearBtn = document.getElementById('ai-image-clear');

  // Click to upload
  zone.addEventListener('click', (e) => {
    if (e.target === clearBtn || clearBtn.contains(e.target)) return;
    input.click();
  });

  // File selected
  input.addEventListener('change', () => {
    if (input.files[0]) setAIImage(input.files[0]);
  });

  // Drag & drop
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) setAIImage(file);
  });

  // Clear image
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearAIImage();
  });

  // Generate
  document.getElementById('ai-generate-btn').addEventListener('click', handleAIGenerate);

  // Apply all
  document.getElementById('ai-apply-all-btn').addEventListener('click', applyAllAIFields);

  // Goto settings link
  document.getElementById('ai-goto-settings').addEventListener('click', (e) => {
    e.preventDefault();
    switchView('settings');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'settings'));
    loadSettings();
  });
}

function setAIImage(file) {
  aiImageFile = file;
  const preview = document.getElementById('ai-image-preview');
  const placeholder = document.getElementById('ai-image-placeholder');
  const clearBtn = document.getElementById('ai-image-clear');
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.src = e.target.result;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    clearBtn.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function clearAIImage() {
  aiImageFile = null;
  document.getElementById('ai-image-preview').classList.add('hidden');
  document.getElementById('ai-image-placeholder').classList.remove('hidden');
  document.getElementById('ai-image-clear').classList.add('hidden');
  document.getElementById('ai-image-input').value = '';
}

function clearAIPanel() {
  clearAIImage();
  document.getElementById('ai-description').value = '';
  document.getElementById('ai-results').classList.add('hidden');
  document.getElementById('ai-result-cards').innerHTML = '';
}

async function handleAIGenerate() {
  const description = document.getElementById('ai-description').value.trim();
  if (!aiImageFile && !description) {
    document.getElementById('ai-description').focus();
    return;
  }

  const btn = document.getElementById('ai-generate-btn');
  const resultsEl = document.getElementById('ai-results');
  const cardsEl = document.getElementById('ai-result-cards');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating…';
  resultsEl.classList.remove('hidden');
  cardsEl.innerHTML = `<div class="ai-loading"><div class="spinner"></div><div>Generating character profile…</div></div>`;

  try {
    const formData = new FormData();
    if (aiImageFile) formData.append('image', aiImageFile);
    if (description) formData.append('description', description);

    const res = await fetch('/api/ai/generate', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Generation failed');

    aiGeneratedData = data;
    renderAIResults(data);
  } catch (err) {
    cardsEl.innerHTML = `<div class="ai-loading" style="color:var(--red)">⚠️ ${esc(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-ai-icon">✨</span> Generate with AI';
  }
}

function renderAIResults(data) {
  const cardsEl = document.getElementById('ai-result-cards');
  cardsEl.innerHTML = '';

  FIELD_META.forEach(f => {
    const value = data[f.key];
    if (!value) return;
    const card = document.createElement('div');
    card.className = 'ai-result-card';
    card.innerHTML = `
      <div class="ai-result-card-header">
        <span class="ai-result-card-label">${f.label}</span>
        <button class="btn-apply-field" data-field="${f.key}">Apply →</button>
      </div>
      <div class="ai-result-card-body">${esc(value)}</div>
    `;
    card.querySelector('.btn-apply-field').addEventListener('click', () => applyAIField(f.key, value));
    cardsEl.appendChild(card);
  });
}

function applyAIField(key, value) {
  const meta = FIELD_META.find(f => f.key === key);
  if (!meta) return;
  const el = document.getElementById(meta.inputId);
  if (el) {
    el.value = value;
    el.style.borderColor = 'var(--green)';
    setTimeout(() => el.style.borderColor = '', 1000);
  }
}

function applyAllAIFields() {
  FIELD_META.forEach(f => {
    if (aiGeneratedData[f.key]) applyAIField(f.key, aiGeneratedData[f.key]);
  });
}

async function checkApiKeyStatus() {
  try {
    const res = await fetch('/api/settings/api-key-status');
    const { configured } = await res.json();
    const warning = document.getElementById('ai-key-warning');
    if (!configured) warning.classList.remove('hidden');
    else warning.classList.add('hidden');
  } catch {}
}

// ── Detail Modal ──────────────────────────────────────────────
function bindDetailModal() {
  document.getElementById('detail-close-btn').addEventListener('click', closeDetailModal);
  document.getElementById('detail-close-btn2').addEventListener('click', closeDetailModal);
  document.getElementById('detail-delete-btn').addEventListener('click', handleDelete);
  document.getElementById('detail-edit-btn').addEventListener('click', () => {
    closeDetailModal();
    openEditorView('edit', activeDetailId);
  });
  document.getElementById('modal-detail').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDetailModal();
  });
}

function openDetailModal(id) {
  const char = characters.find(c => c.id === id);
  if (!char) return;
  activeDetailId = id;

  document.getElementById('detail-name').textContent = char.name;
  document.getElementById('detail-meta').textContent = [char.species, char.role].filter(Boolean).join(' · ');

  const setText = (elId, val) => {
    document.getElementById(elId).textContent = val || '—';
  };
  setText('detail-backstory', char.backstory);
  setText('detail-personality', char.personality);
  setText('detail-key-passions', char.key_passions);
  setText('detail-what-they-care-about', char.what_they_care_about);
  setText('detail-tone-and-voice', char.tone_and_voice);
  setText('detail-first-appeared', char.first_appeared);

  document.getElementById('detail-status').innerHTML =
    `<span class="status-badge status-${char.status}">${cap(char.status)}</span>`;

  const imgEl = document.getElementById('detail-images');
  if (char.images && char.images.length) {
    imgEl.innerHTML = char.images.map(src => `<img src="${esc(src)}" alt="${esc(char.name)}" />`).join('');
  } else {
    imgEl.innerHTML = `<div class="image-placeholder"><div class="image-placeholder-icon">🖼</div><div class="image-placeholder-text">No images yet</div></div>`;
  }

  document.getElementById('modal-detail').classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('modal-detail').classList.add('hidden');
  activeDetailId = null;
}

async function handleDelete() {
  const char = characters.find(c => c.id === activeDetailId);
  if (!char || !confirm(`Delete "${char.name}"? This cannot be undone.`)) return;
  try {
    await fetch(`${API}/${activeDetailId}`, { method: 'DELETE' });
    characters = characters.filter(c => c.id !== activeDetailId);
    closeDetailModal();
    renderCatalog();
    renderBuildRecent();
  } catch (err) { alert('Delete failed: ' + err.message); }
}

// ── Settings ──────────────────────────────────────────────────
function bindSettings() {
  document.getElementById('settings-save-btn').addEventListener('click', handleSettingsSave);
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();

    setVal('s-system-prompt', settings.ai_system_prompt);
    setVal('s-model', settings.ai_model);
    setVal('s-instruction-name', settings.ai_instruction_name);
    setVal('s-instruction-species', settings.ai_instruction_species);
    setVal('s-instruction-role', settings.ai_instruction_role);
    setVal('s-instruction-backstory', settings.ai_instruction_backstory);
    setVal('s-instruction-personality', settings.ai_instruction_personality);
    setVal('s-instruction-key-passions', settings.ai_instruction_key_passions);
    setVal('s-instruction-what-they-care-about', settings.ai_instruction_what_they_care_about);
    setVal('s-instruction-tone-and-voice', settings.ai_instruction_tone_and_voice);

    const badge = document.getElementById('api-key-status-badge');
    if (settings.api_key_configured) {
      badge.className = 'api-key-badge configured';
      badge.textContent = '✓ API Key Configured';
    } else {
      badge.className = 'api-key-badge missing';
      badge.textContent = '✗ API Key Not Set';
    }
  } catch (err) { console.error('Settings load error:', err); }
}

async function handleSettingsSave() {
  const data = {
    ai_system_prompt:                    getVal('s-system-prompt'),
    ai_model:                            getVal('s-model'),
    ai_instruction_name:                 getVal('s-instruction-name'),
    ai_instruction_species:              getVal('s-instruction-species'),
    ai_instruction_role:                 getVal('s-instruction-role'),
    ai_instruction_backstory:            getVal('s-instruction-backstory'),
    ai_instruction_personality:          getVal('s-instruction-personality'),
    ai_instruction_key_passions:         getVal('s-instruction-key-passions'),
    ai_instruction_what_they_care_about: getVal('s-instruction-what-they-care-about'),
    ai_instruction_tone_and_voice:       getVal('s-instruction-tone-and-voice'),
  };

  const apiKey = getVal('s-api-key');
  if (apiKey) data.anthropic_api_key = apiKey;

  const btn = document.getElementById('settings-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    btn.textContent = '✓ Saved';
    document.getElementById('s-api-key').value = '';
    await loadSettings();
    await checkApiKeyStatus();
    setTimeout(() => { btn.textContent = 'Save Settings'; btn.disabled = false; }, 1500);
  } catch (err) {
    alert('Save failed: ' + err.message);
    btn.disabled = false; btn.textContent = 'Save Settings';
  }
}

// ── Helpers ───────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cap(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso || '—'; }
}
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; }
function getVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
