/* ============================================================
   Lovepop Character Builder — Frontend App
   ============================================================ */

const API = '/api/characters';
let characters = [];
let currentView = 'catalog';
let displayMode = 'tile'; // 'tile' | 'list'
let activeDetailId = null;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  bindNav();
  bindCatalogControls();
  bindBuildControls();
  bindModal();
  bindDetailModal();
  loadCharacters();
});

// ============================================================
// NAVIGATION
// ============================================================
function bindNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      switchView(view);
    });
  });
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  if (view === 'build') renderBuildRecent();
}

// ============================================================
// DATA
// ============================================================
async function loadCharacters() {
  try {
    const res = await fetch(API);
    characters = await res.json();
    renderCatalog();
    renderBuildRecent();
  } catch (err) {
    console.error('Failed to load characters:', err);
  }
}

async function createCharacter(data) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create character');
  return res.json();
}

async function deleteCharacter(id) {
  const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete');
}

// ============================================================
// CATALOG
// ============================================================
function bindCatalogControls() {
  document.getElementById('btn-tile-view').addEventListener('click', () => setDisplayMode('tile'));
  document.getElementById('btn-list-view').addEventListener('click', () => setDisplayMode('list'));
  document.getElementById('catalog-new-btn').addEventListener('click', openCreateModal);
  document.getElementById('empty-new-btn').addEventListener('click', openCreateModal);
}

function setDisplayMode(mode) {
  displayMode = mode;
  document.getElementById('btn-tile-view').classList.toggle('active', mode === 'tile');
  document.getElementById('btn-list-view').classList.toggle('active', mode === 'list');
  document.getElementById('tile-view').classList.toggle('hidden', mode !== 'tile');
  document.getElementById('list-view').classList.toggle('hidden', mode !== 'list');
}

function renderCatalog() {
  const count = characters.length;
  document.getElementById('catalog-count').textContent = `${count} character${count !== 1 ? 's' : ''}`;
  renderTileView();
  renderListView();
}

function renderTileView() {
  const grid = document.getElementById('tile-view');
  const empty = document.getElementById('catalog-empty');

  // Remove old tiles (keep the empty state element)
  Array.from(grid.children).forEach(el => {
    if (!el.id || el.id !== 'catalog-empty') el.remove();
  });

  if (characters.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  characters.forEach(char => {
    const tile = buildCharacterTile(char);
    grid.appendChild(tile);
  });
}

function renderListView() {
  const tbody = document.getElementById('list-body');
  const empty = document.getElementById('list-empty');
  tbody.innerHTML = '';

  if (characters.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  characters.forEach(char => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="list-char-name">${escHtml(char.name)}</div>
        ${char.tagline ? `<div style="font-size:11px;color:var(--gray);margin-top:2px;font-style:italic">${escHtml(char.tagline)}</div>` : ''}
      </td>
      <td><span class="status-badge status-${char.status}">${capitalize(char.status)}</span></td>
      <td>
        <div class="list-tags">
          ${(char.art_styles || []).slice(0, 3).map(s => `<span class="tag">${escHtml(s)}</span>`).join('')}
        </div>
      </td>
      <td><span class="list-meta">${(char.products || []).length || '—'}</span></td>
      <td><span class="list-meta">${escHtml(char.first_appeared || '—')}</span></td>
      <td><span class="list-meta">${formatDate(char.created_at)}</span></td>
      <td class="list-action">
        <button class="btn-icon">View →</button>
      </td>
    `;
    tr.addEventListener('click', () => openDetailModal(char.id));
    tbody.appendChild(tr);
  });
}

function buildCharacterTile(char) {
  const tile = document.createElement('div');
  tile.className = 'character-tile';
  tile.dataset.id = char.id;

  const imgContent = char.images && char.images.length > 0
    ? `<img src="${escHtml(char.images[0])}" alt="${escHtml(char.name)}" loading="lazy" />`
    : `<div class="tile-image-placeholder">✨</div>`;

  const artTags = (char.art_styles || []).slice(0, 2)
    .map(s => `<span class="tag coral">${escHtml(s)}</span>`).join('');
  const traitTags = (char.personality_traits || []).slice(0, 2)
    .map(t => `<span class="tag navy">${escHtml(t)}</span>`).join('');

  tile.innerHTML = `
    <div class="tile-image">
      ${imgContent}
      <span class="tile-status-badge status-badge status-${char.status}">${capitalize(char.status)}</span>
    </div>
    <div class="tile-body">
      <div class="tile-name">${escHtml(char.name)}</div>
      ${char.tagline ? `<div class="tile-tagline">${escHtml(char.tagline)}</div>` : ''}
      <div class="tile-tags">${artTags}${traitTags}</div>
    </div>
  `;
  tile.addEventListener('click', () => openDetailModal(char.id));
  return tile;
}

// ============================================================
// BUILD VIEW
// ============================================================
function bindBuildControls() {
  document.getElementById('build-new-btn').addEventListener('click', () => {
    openCreateModal();
  });
}

function renderBuildRecent() {
  const section = document.getElementById('build-recent-section');
  const grid = document.getElementById('build-recent-grid');
  grid.innerHTML = '';

  const recent = [...characters].slice(0, 6);
  if (recent.length === 0) {
    section.classList.remove('visible');
    return;
  }

  section.classList.add('visible');
  recent.forEach(char => {
    const tile = buildCharacterTile(char);
    grid.appendChild(tile);
  });
}

// ============================================================
// CREATE MODAL
// ============================================================
function bindModal() {
  document.getElementById('modal-close-btn').addEventListener('click', closeCreateModal);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeCreateModal);
  document.getElementById('modal-save-btn').addEventListener('click', handleCreate);

  document.getElementById('modal-create').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCreateModal();
  });

  document.getElementById('field-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCreate();
  });
}

function openCreateModal() {
  clearCreateForm();
  document.getElementById('modal-create').classList.remove('hidden');
  setTimeout(() => document.getElementById('field-name').focus(), 50);
}

function closeCreateModal() {
  document.getElementById('modal-create').classList.add('hidden');
}

function clearCreateForm() {
  ['field-name', 'field-tagline', 'field-story', 'field-first-appeared', 'field-art-styles', 'field-traits'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('field-status').value = 'active';
}

async function handleCreate() {
  const name = document.getElementById('field-name').value.trim();
  if (!name) {
    document.getElementById('field-name').focus();
    document.getElementById('field-name').style.borderColor = 'var(--coral)';
    return;
  }
  document.getElementById('field-name').style.borderColor = '';

  const parseList = (id) => document.getElementById(id).value.split(',').map(s => s.trim()).filter(Boolean);

  const data = {
    name,
    tagline: document.getElementById('field-tagline').value.trim(),
    story: document.getElementById('field-story').value.trim(),
    first_appeared: document.getElementById('field-first-appeared').value.trim(),
    status: document.getElementById('field-status').value,
    art_styles: parseList('field-art-styles'),
    personality_traits: parseList('field-traits'),
  };

  const btn = document.getElementById('modal-save-btn');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    const newChar = await createCharacter(data);
    characters.unshift(newChar);
    renderCatalog();
    renderBuildRecent();
    closeCreateModal();
    // If we're in build view, switch to catalog to see the new character
    if (currentView === 'build') switchView('catalog');
  } catch (err) {
    console.error(err);
    alert('Something went wrong. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Character';
  }
}

// ============================================================
// DETAIL MODAL
// ============================================================
function bindDetailModal() {
  document.getElementById('detail-close-btn').addEventListener('click', closeDetailModal);
  document.getElementById('detail-close-btn2').addEventListener('click', closeDetailModal);
  document.getElementById('detail-delete-btn').addEventListener('click', handleDelete);

  document.getElementById('modal-detail').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDetailModal();
  });
}

function openDetailModal(id) {
  const char = characters.find(c => c.id === id);
  if (!char) return;
  activeDetailId = id;

  document.getElementById('detail-name').textContent = char.name;
  document.getElementById('detail-tagline').textContent = char.tagline || '';
  document.getElementById('detail-story').textContent = char.story || '—';
  document.getElementById('detail-first-appeared').textContent = char.first_appeared || '—';

  document.getElementById('detail-status').innerHTML =
    `<span class="status-badge status-${char.status}">${capitalize(char.status)}</span>`;

  // Art styles
  const artEl = document.getElementById('detail-art-styles');
  artEl.innerHTML = char.art_styles && char.art_styles.length
    ? char.art_styles.map(s => `<span class="tag coral">${escHtml(s)}</span>`).join('')
    : '<span style="font-size:12px;color:var(--gray)">—</span>';

  // Personality traits
  const traitsEl = document.getElementById('detail-traits');
  traitsEl.innerHTML = char.personality_traits && char.personality_traits.length
    ? char.personality_traits.map(t => `<span class="tag navy">${escHtml(t)}</span>`).join('')
    : '<span style="font-size:12px;color:var(--gray)">—</span>';

  // Quotes
  const quotesEl = document.getElementById('detail-quotes');
  quotesEl.innerHTML = char.quotes && char.quotes.length
    ? char.quotes.map(q => `<div class="quote-item">"${escHtml(q)}"</div>`).join('')
    : '<span style="font-size:12px;color:var(--gray)">No quotes added yet.</span>';

  // Products
  const prodEl = document.getElementById('detail-products');
  prodEl.innerHTML = char.products && char.products.length
    ? char.products.map(p => `<div class="product-item">${escHtml(p)}</div>`).join('')
    : '<span style="font-size:12px;color:var(--gray)">No products linked yet.</span>';

  // Images
  const imgEl = document.getElementById('detail-images');
  if (char.images && char.images.length > 0) {
    imgEl.innerHTML = char.images.map(src =>
      `<img src="${escHtml(src)}" alt="${escHtml(char.name)}" />`
    ).join('');
  } else {
    imgEl.innerHTML = `
      <div class="image-placeholder">
        <div class="image-placeholder-icon">🖼</div>
        <div class="image-placeholder-text">No images yet</div>
      </div>`;
  }

  document.getElementById('modal-detail').classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('modal-detail').classList.add('hidden');
  activeDetailId = null;
}

async function handleDelete() {
  const char = characters.find(c => c.id === activeDetailId);
  if (!char) return;
  if (!confirm(`Delete "${char.name}"? This cannot be undone.`)) return;

  try {
    await deleteCharacter(activeDetailId);
    characters = characters.filter(c => c.id !== activeDetailId);
    closeDetailModal();
    renderCatalog();
    renderBuildRecent();
  } catch (err) {
    console.error(err);
    alert('Failed to delete. Please try again.');
  }
}

// ============================================================
// HELPERS
// ============================================================
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return isoStr; }
}
