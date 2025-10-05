// src/pages/reserva.js
// Passo 7 — Formulário de reserva (client)

// ===== Utils =====
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

// ===== Supabase REST env (usado só para resumo) =====
const SUPABASE_URL = window.env?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.env?.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  alert("Configuração inválida do Supabase. Verifique SUPABASE_URL e SUPABASE_ANON_KEY.");
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

// ===== Init =====
const booking = safeParse(sessionStorage.getItem("booking"));
if (!booking?.slug || !booking?.checkin || !booking?.checkout) {
  alert("Selecione as datas na página do flat antes de reservar.");
  location.href = "./flats.html";
}

(async function init() {
  // 1) Período
  const nights = nightsBetween(booking.checkin, booking.checkout);
  if (!(nights >= 1)) {
    alert("Período inválido. Selecione as datas novamente.");
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
    alert("Flat não encontrado.");
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
    document.getElementById("form-feedback").textContent =
      "Dados validados! No próximo passo enviaremos sua reserva para confirmação.";

    // Envio ao backend
    try {
      btn.disabled = true;
      const r = await fetch('/api/reservas/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: sessionStorage.getItem('checkoutPayload')
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 409) {
          alert('Ops! As datas escolhidas acabaram de ficar indisponíveis. Tente outro período.');
        } else {
          console.error('API ERROR', r.status, data);
          alert('Não foi possível criar sua reserva. Tente novamente.');
        }
        return;
      }
      sessionStorage.setItem('reserva', JSON.stringify(data.reserva));
      alert('Reserva pendente criada! Vamos ao pagamento no próximo passo.');
      // location.href = './pagamento.html'; // Passo 9
    } catch (e) {
      console.error('NETWORK ERROR', e);
      alert('Falha de rede. Tente novamente.');
    } finally {
      btn.disabled = false;
    }
  });
})();
