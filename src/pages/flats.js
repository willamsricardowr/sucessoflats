// src/pages/flats.js
const SUPABASE_URL = window.env?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.env?.SUPABASE_ANON_KEY;

const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const form = document.getElementById('filters-form');
const btnClear = document.getElementById('btnClear');

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

async function fetchFlats() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/flats`);
  // selecione apenas colunas existentes (igual ao curl que funcionou)
  url.searchParams.set(
    'select',
    'id,slug,nome,preco_base,imagens(url,ordem),flat_amenidade(amenidades(chave))'
  );
  url.searchParams.set('order', 'id.asc');

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Supabase fetch error:', res.status, body);
    throw new Error(`Falha ao carregar flats: ${res.status}`);
  }
  return res.json();
}

function flatAmenities(flat) {
  const rel = flat.flat_amenidade || [];
  return rel.map(r => r.amenidades?.chave || r.amenidades?.nome).filter(Boolean);
}

function passesFilters(flat, state) {
  const preco = Number(flat.preco_base ?? 0);
  if (state.priceMax && preco > Number(state.priceMax)) return false;
  if (state.amenities.length) {
    const keys = flatAmenities(flat);
    return state.amenities.every(a => keys.includes(a));
  }
  return true;
}

function render(flats) {
  grid.innerHTML = '';
  if (!flats.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const f of flats) {
    const firstImg = Array.isArray(f.imagens)
      ? [...f.imagens].sort((a,b)=>(a?.ordem??99)-(b?.ordem??99))[0]
      : null;
    const imgUrl = firstImg?.url || 'https://placehold.co/800x600?text=SUCESSO+FLATS';
    const imgAlt = `Imagem do ${f.nome}`;

    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <img src="${imgUrl}" alt="${imgAlt}" loading="lazy" />
      <div class="body">
        <h3>${f.nome}</h3>
        <p>Desde <strong>R$ ${Number(f.preco_base ?? 0).toFixed(2)}</strong> / noite</p>
        <div class="badges">
          ${flatAmenities(f).slice(0,4).map(a => `<span class="badge">${a}</span>`).join('')}
        </div>
        <a class="btn btn-primary" href="./flat.html?slug=${encodeURIComponent(f.slug || f.id)}" aria-label="Ver detalhes do ${f.nome}">Ver detalhes</a>
      </div>
    `;
    grid.appendChild(card);
  }
}

function getStateFromForm() {
  const priceMax = document.getElementById('priceMax')?.value || '';
  const amenities = Array.from(form.querySelectorAll('input[name="amenidade"]:checked')).map(i => i.value);
  return { priceMax, amenities };
}

// ---------- init único com cache ----------
let DATA = []; // cache do resultado original

function safeRender(list) {
  empty.hidden = true;
  grid.parentElement?.setAttribute('aria-busy', 'false');
  render(list);
}

async function init() {
  try {
    const data = await fetchFlats();
    DATA = Array.isArray(data) ? data : [];
    safeRender(DATA);

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const st = getStateFromForm();
      const filtered = DATA.filter(f => passesFilters(f, st));
      safeRender(filtered);
    });

    btnClear?.addEventListener('click', () => {
      form?.reset();
      safeRender(DATA);
    });
  } catch (e) {
    console.error(e);
    grid.innerHTML = '';
    empty.hidden = false;
    empty.textContent = 'Erro ao carregar flats. Verifique SUPABASE_URL/ANON_KEY em ../utils/env.js.';
    grid.parentElement?.setAttribute('aria-busy', 'false');
  }
}

document.addEventListener('DOMContentLoaded', init);
