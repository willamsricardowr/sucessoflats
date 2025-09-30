// src/home.js
const SUPABASE_URL = window.env?.SUPABASE_URL || window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.env?.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY;
const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

const fmtBRL = (n) => Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function fetchFlatsHome(limit = 8) {
  const qs = new URLSearchParams();
  qs.set("select", "id,slug,titulo,preco_noite,cidade,estado,capa_url");
  qs.set("order", "id.desc");
  qs.set("limit", String(limit));
  const res = await fetch(`${SUPABASE_URL}/rest/v1/flats?${qs}`, { headers });
  if (!res.ok) throw new Error(`Erro ao buscar flats (${res.status})`);
  return res.json();
}

function renderCards(flats) {
  const grid = document.getElementById("home-cards");
  if (!grid) return;
  grid.innerHTML = "";

  flats.forEach((f) => {
    const href = `./src/pages/flat.html?slug=${encodeURIComponent(f.slug)}`;
    const img = f.capa_url || "https://placehold.co/640x420?text=Sucesso+Flats";
    const loc = [f.cidade, f.estado].filter(Boolean).join(" · ");
    const price = fmtBRL(f.preco_noite);

    const article = document.createElement("article");
    article.className = "card reveal";
    article.innerHTML = `
      <a class="card__media" href="${href}" aria-label="${f.titulo}">
        <img src="${img}" alt="${f.titulo || "Flat"}" loading="lazy" />
      </a>
      <div class="card__body">
        <div class="badge">${loc || "Próximo ao aeroporto"}</div>
        <h3 class="card__title">${f.titulo || "Flat"}</h3>
        <p class="card__meta">&nbsp;</p>
        <div class="card__footer">
          <span class="muted">${price}/noite</span>
          <a class="btn btn-primary" href="${href}">Reservar</a>
        </div>
      </div>
    `;
    grid.appendChild(article);
  });
}

// ---- NOVO: skeletons e estado vazio ----
function showSkeletons(n = 4) {
  const grid = document.getElementById("home-cards");
  if (!grid) return;
  grid.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const s = document.createElement("article");
    s.className = "card";
    s.innerHTML = `
      <div class="card__media skeleton" style="height:200px;"></div>
      <div class="card__body">
        <div class="badge skeleton" style="width:140px;height:22px;"></div>
        <h3 class="card__title skeleton" style="width:70%;height:20px;margin:8px 0;"></h3>
        <p class="card__meta skeleton" style="width:50%;height:16px;"></p>
        <div class="card__footer">
          <span class="muted skeleton" style="width:110px;height:18px;"></span>
          <span class="btn btn-primary skeleton" style="width:96px;height:36px;border-radius:8px;"></span>
        </div>
      </div>
    `;
    grid.appendChild(s);
  }
}

function showEmptyState() {
  const grid = document.getElementById("home-cards");
  if (!grid) return;
  grid.innerHTML = `
    <div class="muted" style="padding:12px;border:1px dashed rgba(0,0,0,.12);border-radius:10px;">
      Nenhum flat cadastrado ainda. Clique em “Ver todos os flats” ou adicione no Supabase.
    </div>
  `;
}

(async function boot() {
  try {
    showSkeletons(4); // mostra esqueletos enquanto carrega
    const flats = await fetchFlatsHome(8);
    if (!flats.length) return showEmptyState();
    renderCards(flats);
  } catch (e) {
    console.error(e);
    showEmptyState();
  }
})();
