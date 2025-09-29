const SUPABASE_URL = window.env?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.env?.SUPABASE_ANON_KEY;
const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

const params = new URLSearchParams(location.search);
const slug = params.get('slug');

const el = (id) => document.getElementById(id);

async function fetchFlatBySlug(slug) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/flats`);
  // selecione apenas colunas existentes/seguras
  url.searchParams.set('select', 'id,slug,nome,preco_base,imagens(url,ordem,alt),flat_amenidade(amenidades(chave,nome,label))');
  url.searchParams.set('slug', `eq.${slug}`);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('fetchFlatBySlug error:', res.status, body);
    throw new Error('Falha ao buscar flat');
  }
  const data = await res.json();
  return data[0] || null;
}

function renderGallery(imgs) {
  const main = el('gallery-main');
  const thumbs = el('thumbs');

  if (!imgs?.length) {
    const url = 'https://placehold.co/1200x800?text=SUCESSO+FLATS';
    main.src = url; main.alt = 'Imagem temporária';
    thumbs.innerHTML = '';
    return;
  }

  const sorted = [...imgs].sort((a,b)=>(a?.ordem??99)-(b?.ordem??99));
  main.src = sorted[0].url;
  main.alt = sorted[0].alt || 'Imagem do flat';
  thumbs.innerHTML = '';

  sorted.forEach((im, idx) => {
    const t = document.createElement('img');
    t.src = im.url;
    t.alt = im.alt || `Imagem ${idx+1}`;
    t.addEventListener('click', () => { main.src = im.url; main.alt = t.alt; });
    thumbs.appendChild(t);
  });
}

function renderAmenities(rel) {
  const list = el('amenidades');
  list.innerHTML = '';
  (rel || []).forEach(r => {
    const label = r?.amenidades?.label || r?.amenidades?.nome || r?.amenidades?.chave || 'Amenidade';
    const li = document.createElement('li');
    li.className = 'badge';
    li.textContent = label;
    list.appendChild(li);
  });
}

function initMap({ lat, lng }) {
  // Coordenadas temporárias: Aeroporto de Teresina
  const fallback = { lat: -5.0606, lng: -42.8236 };
  const center = (typeof lat === 'number' && typeof lng === 'number') ? { lat, lng } : fallback;

  const map = L.map('map').setView([center.lat, center.lng], 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  L.marker([center.lat, center.lng]).addTo(map);
}

async function init() {
  if (!slug) {
    alert('Slug não informado. Voltando para a lista de flats.');
    location.href = './flats.html';
    return;
  }

  try {
    const flat = await fetchFlatBySlug(slug);
    if (!flat) { location.href = './flats.html'; return; }

    document.title = `${flat.nome} • Sucesso Flats`;
    el('bc-current').textContent = flat.nome;
    el('nome').textContent = flat.nome;

    // Campos opcionais (se não existirem ainda, mostra traço)
    el('descricao').textContent = flat.descricao || '—';
    el('preco').textContent = Number(flat.preco_base ?? 0).toFixed(2);
    el('ocupacao').textContent = `Ocupação máxima: ${flat.ocupacao_maxima ?? '—'}`;

    renderGallery(flat.imagens);
    renderAmenities(flat.flat_amenidade);

    // placeholder de mapa (trocaremos por coords reais depois)
    initMap({ lat: null, lng: null });
  } catch (e) {
    console.error(e);
    alert('Erro ao carregar o flat.');
  }
}

init();
