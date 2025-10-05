// src/pages/flat.js
// Detalhe do flat + calendário + ir para reserva

// ====== ENV / HEADERS ======
const SUPABASE_URL = window.env?.SUPABASE_URL || window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.env?.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY;
const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

// ====== PARAMS / DOM HELPERS ======
const params = new URLSearchParams(location.search);
const slug = params.get('slug');
const el = (id) => document.getElementById(id);
const fmtBRL = (n) => Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

if (!slug) {
  location.href = './flats.html';
}

// ====== LOW-LEVEL REST ======
async function restGet(pathWithQuery) {
  const url = new URL(`${SUPABASE_URL}${pathWithQuery}`);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[REST ${url.pathname}]`, res.status, body);
    throw new Error(`Falha na chamada ${url.pathname} (${res.status})`);
  }
  return res.json();
}

// ====== FETCHES ======
async function fetchFlatBySlug(s) {
  const qs = new URLSearchParams();
  // ⚠️ usar campos existentes: nome + preco_base
  qs.set('select',
    'id,slug,nome,descricao,preco_base,ocupacao_maxima,cidade,estado,endereco,latitude,longitude,capa_url'
  );
  qs.set('slug', `eq.${s}`);
  const data = await restGet(`/rest/v1/flats?${qs.toString()}`);
  return data?.[0] || null;
}

async function fetchImages(flatId) {
  const qs = new URLSearchParams();
  qs.set('select', 'id,flat_id,url,ordem');
  qs.set('flat_id', `eq.${flatId}`);
  qs.set('order', 'ordem.asc');
  const data = await restGet(`/rest/v1/imagens?${qs.toString()}`);
  return (data || []).filter((i) => i?.url);
}

async function fetchAmenities(flatId) {
  const qs = new URLSearchParams();
  qs.set('select', 'id,amenidade_id,amenidades(id,nome,icon)');
  qs.set('flat_id', `eq.${flatId}`);
  const data = await restGet(`/rest/v1/flat_amenidade?${qs.toString()}`);
  return (data || []).map((row) => {
    const a = row.amenidades || {};
    return { id: a.id ?? row.amenidade_id ?? row.id, nome: a.nome || 'Amenidade', icon: a.icon || null };
  });
}

// ====== RENDER ======
function renderGallery(imgs) {
  const main = el('gallery-main');
  const thumbs = el('thumbs');

  if (!imgs?.length) {
    const url = 'https://placehold.co/1200x800?text=SUCESSO+FLATS';
    if (main) {
      main.src = url;
      main.alt = 'Imagem temporária';
    }
    if (thumbs) thumbs.innerHTML = '';
    return;
  }

  const sorted = [...imgs].sort((a, b) => (a?.ordem ?? 99) - (b?.ordem ?? 99));
  if (main) {
    main.src = sorted[0].url;
    main.alt = 'Imagem do flat';
  }
  if (thumbs) thumbs.innerHTML = '';

  sorted.forEach((im, idx) => {
    const t = document.createElement('img');
    t.src = im.url;
    t.alt = `Imagem ${idx + 1}`;
    t.addEventListener('click', () => {
      main.src = im.url;
      main.alt = t.alt;
    });
    thumbs.appendChild(t);
  });
}

function renderAmenities(amenidades) {
  const list = el('amenidades');
  if (!list) return;
  list.innerHTML = '';

  if (!amenidades?.length) {
    const li = document.createElement('div');
    li.style.opacity = '.7';
    li.textContent = 'Sem amenidades cadastradas.';
    list.appendChild(li);
    return;
  }

  amenidades.forEach((a) => {
    const li = document.createElement('li');
    li.className = 'badge';
    li.textContent = a.icon ? `${a.icon} ${a.nome}` : a.nome;
    list.appendChild(li);
  });
}

function initMap({ lat, lng }) {
  const fallback = { lat: -5.0606, lng: -42.8236 };
  const center = (typeof lat === 'number' && typeof lng === 'number') ? { lat, lng } : fallback;

  const map = L.map('map').setView([center.lat, center.lng], 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  L.marker([center.lat, center.lng]).addTo(map);
}

// ====== INIT ======
async function init() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('SUPABASE_URL/ANON_KEY ausentes no front.');
    return;
  }

  try {
    const flat = await fetchFlatBySlug(slug);
    if (!flat) {
      location.href = './flats.html';
      return;
    }

    const [images, amenities] = await Promise.all([
      fetchImages(flat.id),
      fetchAmenities(flat.id),
    ]);

    document.title = `${flat.nome} • Sucesso Flats`;
    el('bc-current') && (el('bc-current').textContent = flat.nome);
    el('nome') && (el('nome').textContent = flat.nome);
    el('descricao') && (el('descricao').textContent = flat.descricao || '—');
    el('preco') && (el('preco').textContent = fmtBRL(flat.preco_base));
    el('ocupacao') && (el('ocupacao').textContent = `Ocupação máxima: ${flat.ocupacao_maxima ?? '—'}`);

    renderGallery(images?.length ? images : (flat.capa_url ? [{ url: flat.capa_url, ordem: 0 }] : []));
    renderAmenities(amenities);
    initMap({ lat: flat.latitude ?? null, lng: flat.longitude ?? null });

    // ====== Calendário (Passo 6) + avançar (Passo 7)
    const { mountCalendar } = await import('../components/calendar.js');
    const { getBusyRangesBySlug } = await import('./availability.mock.js');

    const calendarEl = document.getElementById('calendar');
    if (calendarEl) {
      const busyRanges = getBusyRangesBySlug(slug); // mock temporário
      mountCalendar(calendarEl, {
        busyRanges,
        onChange: ({ checkin, checkout }) => {
          el('checkin').value = checkin || '';
          el('checkout').value = checkout || '';
          el('btn-avancar').disabled = !(checkin && checkout);
        },
      });
    }

    el('btn-avancar')?.addEventListener('click', () => {
      const ci = el('checkin').value;
      const co = el('checkout').value;
      if (!(ci && co)) return;
      if (new Date(`${co}T00:00:00Z`) <= new Date(`${ci}T00:00:00Z`)) {
        alert('A data de saída deve ser após a data de entrada.');
        return;
      }
      sessionStorage.setItem('booking', JSON.stringify({ slug, checkin: ci, checkout: co }));
      // Ir para o formulário (caminho absoluto evita 404 por pasta atual)
      location.href = '/src/pages/reserva.html';
    });

  } catch (e) {
    console.error(e);
    alert('Não foi possível carregar o flat.');
    location.href = './flats.html';
  }
}

init();
