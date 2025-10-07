// src/pages/reserva.js
// Passo 7 — Formulário de reserva (client)

/* ========= UI helpers (overlay + toast) ========= */
function showOverlay(msg='Processando...') {
  let el = document.getElementById('overlay-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'overlay-loading';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;color:#fff;font:600 16px/1.2 system-ui';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'flex';
}
function hideOverlay(){ const el=document.getElementById('overlay-loading'); if(el) el.style.display='none'; }
function showToast(msg, type='error'){
  let b = document.getElementById('toast-banner');
  if(!b){
    b = document.createElement('div');
    b.id='toast-banner';
    b.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:10px 14px;border-radius:10px;color:#fff;z-index:10000;max-width:min(92vw,680px);box-shadow:0 6px 20px rgba(0,0,0,.2)';
    document.body.appendChild(b);
  }
  b.style.background = type==='error' ? '#ef4444' : '#10b981';
  b.textContent = msg;
  b.style.display='block';
  clearTimeout(b._t);
  b._t = setTimeout(()=>{ b.style.display='none'; }, 4500);
}

/* ========= Utils ========= */
function safeParse(json) {
  try { return JSON.parse(json || "null"); } catch { return null; }
}
const fmtCurrency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateBR = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });

function nightsBetween(ci, co) {
  const a = new Date(`${ci}T00:00:00Z`);
  const b = new Date(`${co}T00:00:00Z`);
  return Math.round((b - a) / 86400000); // deve ser >= 1
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function fillGuestsSelect(max = 4) {
  const sel = document.getElementById("hospedes");
  sel.innerHTML = `<option value="">Selecione…</option>`;
  const limit = Math.max(1, Number(max) || 4);
  for (let i = 1; i <= limit; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    sel.appendChild(opt);
  }
}

function maskPhoneBR(v = "") {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function validate() {
  const errs = {};
  const nome = document.getElementById("nome").value.trim();
  const email = document.getElementById("email").value.trim();
  const telefone = document.getElementById("telefone").value.trim();
  const hospedes = document.getElementById("hospedes").value.trim();
  const hora = document.getElementById("hora").value.trim();

  if (nome.length < 5 || !nome.includes(" ")) errs.nome = "Informe nome e sobrenome.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "E-mail inválido.";
  if (telefone.replace(/\D/g, "").length < 10) errs.telefone = "Telefone inválido.";
  if (!hospedes) errs.hospedes = "Selecione o número de hóspedes.";
  if (!hora) errs.hora = "Informe o horário estimado de chegada.";

  ["nome", "email", "telefone", "hospedes", "hora"].forEach((k) => {
    const el = document.getElementById(`err-${k}`);
    if (el) el.textContent = errs[k] || "";
  });

  const ok = Object.keys(errs).length === 0;
  const btn = document.getElementById("btn-continuar");
  if (btn) btn.disabled = !ok;
  return ok;
}

function attachLiveValidation() {
  document.querySelectorAll("#form input, #form select, #form textarea").forEach((el) => {
    el.addEventListener("input", validate);
    el.addEventListener("blur", validate);
  });
  const tel = document.getElementById("telefone");
  tel.addEventListener("input", () => { tel.value = maskPhoneBR(tel.value); });
}

/* ========= Supabase REST env (usado só para resumo) ========= */
const SUPABASE_URL = window.env?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.env?.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  showToast("Configuração inválida do Supabase. Verifique SUPABASE_URL e SUPABASE_ANON_KEY.", 'error');
  throw new Error("Missing Supabase env.");
}

const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

async function fetchFlatBySlug(slug) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/flats`);
  url.searchParams.set("select", "id,slug,nome,preco_base,ocupacao_maxima");
  url.searchParams.set("slug", `eq.${slug}`);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Falha ao buscar flat");
  const data = await res.json();
  return data?.[0] || null;
}

/* ========= Init ========= */
const booking = safeParse(sessionStorage.getItem("booking"));
if (!booking?.slug || !booking?.checkin || !booking?.checkout) {
  showToast("Selecione as datas na página do flat antes de reservar.", 'error');
  location.href = "./flats.html";
}

(async function init() {
  // 1) Período
  const nights = nightsBetween(booking.checkin, booking.checkout);
  if (!(nights >= 1)) {
    showToast("Período inválido. Selecione as datas novamente.", 'error');
    location.href = "./flats.html";
    return;
  }

  // 2) Flat
  let flat = null;
  try {
    flat = await fetchFlatBySlug(booking.slug);
  } catch (e) {
    console.error("fetchFlatBySlug error", e);
  }
  if (!flat) {
    showToast("Flat não encontrado.", 'error');
    location.href = "./flats.html";
    return;
  }

  // 3) Resumo
  const price = Number(flat.preco_base) || 0;
  const total = Number((nights * price).toFixed(2));
  setText("sum-flat", flat.nome);
  setText("sum-ci", fmtDateBR(booking.checkin));
  setText("sum-co", fmtDateBR(booking.checkout));
  setText("sum-noites", String(nights));
  setText("sum-preco", fmtCurrency.format(price));
  setText("sum-total", fmtCurrency.format(total));

  fillGuestsSelect(flat.ocupacao_maxima);
  attachLiveValidation();
  validate();

  // 4) Submit
  const form = document.getElementById("form");
  const btn = document.getElementById("btn-continuar");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      flat_slug: flat.slug,
      flat_id: flat.id,
      flat_nome: flat.nome,
      checkin: booking.checkin,
      checkout: booking.checkout,
      noites: nights,
      preco_noite: price,
      total: total,
      hospede: {
        nome: document.getElementById("nome").value.trim(),
        email: document.getElementById("email").value.trim(),
        telefone: document.getElementById("telefone").value.trim(),
        hospedes: Number(document.getElementById("hospedes").value),
        hora_chegada: document.getElementById("hora").value,
        obs: document.getElementById("obs").value.trim() || null
      },
      politica_cancelamento: "cancelamento grátis até 48h antes"
    };

    sessionStorage.setItem("checkoutPayload", JSON.stringify(payload));
    const fb = document.getElementById("form-feedback");
    if (fb) fb.textContent = "Validando e criando sua reserva…";

    try {
      btn.disabled = true;
      showOverlay('Criando sua reserva…');

      // 1) cria a reserva pendente
      const r = await fetch('/api/reservas/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: sessionStorage.getItem('checkoutPayload')
      });
      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        hideOverlay();
        if (r.status === 409) {
          showToast('Ops! As datas escolhidas ficaram indisponíveis. Tente outro período.', 'error');
        } else {
          console.error('API ERROR', r.status, data);
          showToast('Não foi possível criar sua reserva. Tente novamente.', 'error');
        }
        return;
      }

      // reserva criada ou reutilizada
      const reservaCriada = data.reserva;
      sessionStorage.setItem('reserva', JSON.stringify(reservaCriada));

      // 2) chama o Mercado Pago
      showOverlay('Gerando link de pagamento…');

      const reservaParaPagamento = {
        id: reservaCriada.id,
        total: Number(reservaCriada.total),
        flat_nome: flat.nome,
        hospede_nome: payload.hospede.nome,
        hospede_email: payload.hospede.email,
        flat_id: flat.id,
        checkin: booking.checkin,
        checkout: booking.checkout
      };

      // salva para reuso (opcional)
      sessionStorage.setItem('reserva', JSON.stringify(reservaParaPagamento));

      const payResp = await fetch('/api/pagamentos/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reserva: reservaParaPagamento })
      });
      let payJson = {};
      try { payJson = await payResp.json(); } catch { payJson = {}; }

      hideOverlay();

      if (!payResp.ok || !payJson?.init_point) {
        console.error('Erro ao iniciar pagamento:', payJson);
        showToast('Não foi possível iniciar o pagamento agora. Tente novamente em instantes.', 'error');
        return;
      }

      // 3) redireciona ao checkout
      window.location.assign(payJson.init_point);

    } catch (e) {
      hideOverlay();
      console.error('NETWORK ERROR', e);
      showToast('Falha de rede. Tente novamente.', 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
