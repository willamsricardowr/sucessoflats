// src/pages/flat.js
// Detalhe do flat: versão mínima, tolerante a schema/IDs

// ===== ENV =====
const SUPABASE_URL = window.env?.SUPABASE_URL || window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.env?.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY;
const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

// ===== Helpers =====
const qs = new URLSearchParams(location.search);
const slug = qs.get('slug');
const $id = (id) => document.getElementById(id);
const setTextMulti = (ids, value) => ids.forEach(id => { const el = $id(id); if (el) el.textContent = value; });
const fmtBRL = (n) => Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

if (!slug) location.href = './flats.html';

async function restGet(path) {
  const url = new URL(`${SUPABASE_URL}${path}`);
  const r = await fetch(url, { headers });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('REST error', r.status, t);
    throw new Error(`REST ${r.status}`);
  }
  return r.json();
}

// ===== Fetch: só colunas que com certeza existem =====
async function fetchFlatBySlug(s) {
  const p = new URLSearchParams();
  p.set('select', 'id,slug,nome,descricao,preco_base,ocupacao_maxima'); // <- mínimo seguro
  p.set('slug', `eq.${s}`);
  const data = await restGet(`/rest/v1/flats?${p.toString()}`);
  return data?.[0] || null;
}

// ===== UI =====
function renderBasic(flat) {
  document.title = `${flat.nome} • Sucesso Flats`;

  // Título (aceita dois padrões de IDs)
  setTextMulti(['nome', 'flat-title'], flat.nome || '—');

  // Descrição
  setTextMulti(['descricao', 'flat-desc'], flat.descricao || '—');

  // Preço por noite
  const precoFmt = fmtBRL(flat.preco_base);
  setTextMulti(['preco', 'flat-price'], precoFmt);

  // Ocupação
  const occ = flat.ocupacao_maxima != null ? String(flat.ocupacao_maxima) : '—';
  setTextMulti(['ocupacao', 'flat-occupancy'], occ);

  // Imagem principal (se tiver <img id="gallery-main">)
  const mainImg = $id('gallery-main');
  if (mainImg && !mainImg.src) {
    mainImg.src = 'https://placehold.co/1200x800?text=SUCESSO+FLATS';
    mainImg.alt = `Imagem do ${flat.nome}`;
  }
}

async function initCalendarAndNav() {
  // Calendário mock (Passo 6)
  try {
    const { mountCalendar } = await import('../components/calendar.js');
    const { getBusyRangesBySlug } = await import('./availability.mock.js');

    const calEl = $id('calendar');
    if (calEl) {
      const busyRanges = getBusyRangesBySlug(slug);
      mountCalendar(calEl, {
        busyRanges,
        onChange: ({ checkin, checkout }) => {
          $id('checkin').value = checkin || '';
          $id('checkout').value = checkout || '';
          const btn = $id('btn-avancar');
          if (btn) btn.disabled = !(checkin && checkout);
        },
      });
    }
  } catch (e) {
    console.warn('Calendário indisponível:', e.message);
  }

  // Botão avançar (Passo 7)
  const btn = $id('btn-avancar');
  if (btn) {
    btn.addEventListener('click', () => {
      const ci = $id('checkin')?.value;
      const co = $id('checkout')?.value;
      if (!(ci && co)) return;
      if (new Date(`${co}T00:00:00Z`) <= new Date(`${ci}T00:00:00Z`)) {
        alert('A data de saída deve ser após a data de entrada.');
        return;
      }
      sessionStorage.setItem('booking', JSON.stringify({ slug, checkin: ci, checkout: co }));
      location.href = '/src/pages/reserva.html'; // caminho absoluto
    });
  }
}

// ===== Init =====
(async function init() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Faltam SUPABASE_URL/ANON_KEY (../utils/env.js)');
    return;
  }
  try {
    const flat = await fetchFlatBySlug(slug);
    if (!flat) {
      alert('Flat não encontrado.');
      location.href = './flats.html';
      return;
    }
    renderBasic(flat);
    initCalendarAndNav();
  } catch (e) {
    console.error(e);
    alert('Não foi possível carregar o flat.');
    location.href = './flats.html';
  }
})();
