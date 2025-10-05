// src/pages/reserva.js
// Passo 7 — Formulário de reserva (client)

const SUPABASE_URL = window.env?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.env?.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  alert("Configuração inválida do Supabase. Verifique SUPABASE_URL e SUPABASE_ANON_KEY.");
  throw new Error("Missing Supabase env.");
}

const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

const booking = safeParse(sessionStorage.getItem("booking"));
if (!booking?.slug || !booking?.checkin || !booking?.checkout) {
  alert("Selecione as datas na página do flat antes de reservar.");
  location.href = "./flats.html";
}

const fmtCurrency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateBR = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", { timeZone: "UTC" });

function nightsBetween(ci, co) {
  const a = new Date(`${ci}T00:00:00`);
  const b = new Date(`${co}T00:00:00`);
  const diff = Math.round((b - a) / (1000 * 60 * 60 * 24));
  return diff; // deve ser >= 1
}

async function fetchFlatBySlug(slug) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/flats`);
  url.searchParams.set("select", "id,slug,nome,preco_base,ocupacao_maxima");
  url.searchParams.set("slug", `eq.${slug}`);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Falha ao buscar flat");
  const data = await res.json();
  return data?.[0] || null;
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

function maskPhoneBR(value) {
  const d = (value || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length <= 10) {
    // (DD) XXXX-XXXX
    const dd = d.slice(0, 2);
    const p1 = d.slice(2, 6);
    const p2 = d.slice(6, 10);
    return d.length > 6 ? `(${dd}) ${p1}-${p2}` : d.length > 2 ? `(${dd}) ${p1}` : d.length > 0 ? `(${dd}` : "";
  }
  // 11 dígitos: (DD) 9XXXX-XXXX
  const dd = d.slice(0, 2);
  const p1 = d.slice(2, 7);
  const p2 = d.slice(7, 11);
  return `(${dd}) ${p1}-${p2}`;
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

  // render
  ["nome", "email", "telefone", "hospedes", "hora"].forEach((k) => {
    document.getElementById(`err-${k}`).textContent = errs[k] || "";
  });

  const ok = Object.keys(errs).length === 0;
  document.getElementById("btn-continuar").disabled = !ok;
  return ok;
}

function attachLiveValidation() {
  document.querySelectorAll("#form input, #form select, #form textarea").forEach((el) => {
    el.addEventListener("input", validate);
    el.addEventListener("blur", validate);
  });

  // máscara telefone
  const tel = document.getElementById("telefone");
  tel.addEventListener("input", () => {
    tel.value = maskPhoneBR(tel.value);
  });
}

function safeParse(json) {
  try { return JSON.parse(json || "null"); } catch { return null; }
}

(async function init() {
  // 1) Checa período
  const nights = nightsBetween(booking.checkin, booking.checkout);
  if (!(nights >= 1)) {
    alert("Período inválido. Selecione as datas novamente.");
    location.href = "./flats.html";
    return;
  }

  // 2) Busca flat
  let flat = null;
  try {
    flat = await fetchFlatBySlug(booking.slug);
  } catch (e) {
    console.error(e);
  }
  if (!flat) {
    alert("Flat não encontrado.");
    location.href = "./flats.html";
    return;
  }

  // 3) Preenche UI de resumo e hóspedes
  const price = Number(flat.preco_base) || 0;
  const total = Number((nights * price).toFixed(2));

  setText("sum-flat", flat.nome);
  setText("sum-ci", fmtDateBR(booking.checkin));
  setText("sum-co", fmtDateBR(booking.checkout));
  setText("sum-noites", String(nights));
  setText("sum-preco", fmtCurrency.format(price));
  setText("sum-total", fmtCurrency.format(total));

  fillGuestsSelect(flat.ocupacao_maxima);

  // 4) Validação reativa
  attachLiveValidation();
  validate(); // estado inicial

  // 5) Submit → salva checkoutPayload na sessão
  document.getElementById("form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      flat_slug: flat.slug,
      flat_id: flat.id,
      flat_nome: flat.nome,
      checkin: booking.checkin,      // YYYY-MM-DD
      checkout: booking.checkout,    // YYYY-MM-DD
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
    // (Opcional) Redirecionar para revisão:
    // location.href = "./revisao.html";
  });
})();
