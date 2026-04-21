const API = 'http://localhost:3000/api';

let allPokemon = [];
let activeType = null;
let activeGen = 1;

// DOM
const grid = document.getElementById('pokemon-grid');
const typeFilters = document.getElementById('type-filters');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const evoChain = document.getElementById('evo-chain');

// Init
(async () => {
  await loadTypes();
  await loadPokemon(1);

  document.querySelectorAll('.tab').forEach(tab =>
    tab.addEventListener('click', () => {
      document.querySelector('.tab.active').classList.remove('active');
      tab.classList.add('active');
      activeGen = parseInt(tab.dataset.gen);
      activeType = null;
      document.querySelectorAll('.type-btn.active').forEach(b => b.classList.remove('active'));
      loadPokemon(activeGen);
    })
  );

  document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
})();

async function loadTypes() {
  const types = await fetch(`${API}/types`).then(r => r.json());
  typeFilters.innerHTML = types.map(t =>
    `<button class="type-btn type-${t}" data-type="${t}">${t}</button>`
  ).join('');

  typeFilters.addEventListener('click', e => {
    if (!e.target.classList.contains('type-btn')) return;
    const type = e.target.dataset.type;
    if (activeType === type) {
      activeType = null;
      e.target.classList.remove('active');
    } else {
      document.querySelectorAll('.type-btn.active').forEach(b => b.classList.remove('active'));
      activeType = type;
      e.target.classList.add('active');
    }
    renderGrid();
  });
}

async function loadPokemon(gen) {
  grid.innerHTML = '<p style="text-align:center;grid-column:1/-1;">Loading...</p>';
  allPokemon = await fetch(`${API}/pokemon?gen=${gen}`).then(r => r.json());
  renderGrid();
}

function renderGrid() {
  const filtered = activeType
    ? allPokemon.filter(p => p.types.includes(activeType))
    : allPokemon;

  if (!filtered.length) {
    grid.innerHTML = '<p style="text-align:center;grid-column:1/-1;">No Pokémon found for this type.</p>';
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="pokemon-card" data-id="${p.id}">
      <img src="${p.sprite}" alt="${p.name}" loading="lazy">
      <div class="id">#${String(p.id).padStart(3, '0')}</div>
      <div class="name">${p.name}</div>
      <div class="types">
        ${p.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('')}
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.pokemon-card').forEach(card =>
    card.addEventListener('click', () => showEvolution(parseInt(card.dataset.id), card.querySelector('.name').textContent))
  );
}

async function showEvolution(id, name) {
  modalTitle.textContent = `${name} — Evolution Chain`;
  evoChain.innerHTML = 'Loading...';
  modal.classList.remove('hidden');

  const data = await fetch(`${API}/pokemon/${id}/evolution`).then(r => r.json());

  evoChain.innerHTML = data.chain.map((stage, i) => {
    const arrow = i < data.chain.length - 1 ? '<div class="evo-arrow">→</div>' : '';
    const isCurrent = stage.id === data.currentId ? 'current' : '';
    return `
      <div class="evo-stage ${isCurrent}">
        <img src="${stage.sprite}" alt="${stage.name}">
        <div class="name">${stage.name}</div>
      </div>
      ${arrow}
    `;
  }).join('');
}
