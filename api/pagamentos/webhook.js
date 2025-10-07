// api/pagamentos/webhook.js
import crypto from 'node:crypto';

/** ========= GOOGLE AUTH ========= */
async function getGoogleAccessToken() {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600; // 1h

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: process.env.GOOGLE_SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp,
  };

  const b64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

  const signingInput = `${b64url(header)}.${b64url(claims)}`;
  const sign = crypto.createSign('RSA-SHA256');
  const pk = (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  sign.update(signingInput);
  const signature = sign.sign(pk).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

  const jwt = `${signingInput}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  if (!resp.ok) throw new Error('Falha ao obter token Google');
  const json = await resp.json();
  return json.access_token;
}

/** ========= CALENDAR HELPERS ========= */
async function findCalendarEventByReserva({ calendarId, reservaId, startISO, endISO, accessToken }) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('timeMin', new Date(startISO).toISOString());
  url.searchParams.set('timeMax', new Date(endISO).toISOString());
  // Busca por propriedade privada (idempotência)
  url.searchParams.set('privateExtendedProperty', `reservaId=${reservaId}`);
  url.searchParams.set('maxResults', '2');
  url.searchParams.set('singleEvents', 'true');
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }});
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Falha ao buscar evento existente: ${t}`);
  }
  const data = await resp.json();
  return (data.items || [])[0] || null;
}

async function createCalendarEvent({ calendarId, summary, description, startISO, endISO, reservaId, accessToken }) {
  // Idempotência: se já existe um evento com essa reservaId no intervalo, não cria outro
  const existing = await findCalendarEventByReserva({ calendarId, reservaId, startISO, endISO, accessToken });
  if (existing) return existing;

  const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      summary,
      description,
      start: { dateTime: startISO, timeZone: 'America/Fortaleza' },
      end:   { dateTime: endISO,   timeZone: 'America/Fortaleza' },
      extendedProperties: {
        private: { reservaId: String(reservaId) }
      }
    })
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Falha ao criar evento: ${t}`);
  }
  return resp.json();
}

/** ========= MP HELPERS ========= */
async function getPaymentById(id, token) {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw new Error(`MP payments lookup falhou: ${await r.text()}`);
  return r.json();
}

async function getMerchantOrderById(id, token) {
  const r = await fetch(`https://api.mercadopago.com/merchant_orders/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw new Error(`MP merchant_order lookup falhou: ${await r.text()}`);
  return r.json();
}

/** ========= SUPABASE HELPERS ========= */
async function fetchReservaById(id, serviceKey, url) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const qs = new URL(`${url}/rest/v1/reservas`);
  qs.searchParams.set('select', '*,flats!inner(id,slug,nome)');
  qs.searchParams.set('id', `eq.${id}`);
  const r = await fetch(qs, { headers });
  if (!r.ok) throw new Error(`Falha ao buscar reserva: ${await r.text()}`);
  const arr = await r.json();
  return arr[0] || null;
}

async function updateReservaStatusConfirmada(id, serviceKey, url) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const r = await fetch(`${url}/rest/v1/reservas?id=eq.${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'confirmada' })
  });
  if (!r.ok) throw new Error(`Falha ao atualizar reserva: ${await r.text()}`);
}

export default async function handler(req, res) {
  try {
    // (Opcional) Gate simples por header
    if (process.env.MP_WEBHOOK_SECRET) {
      const token = req.headers['x-mp-signature'];
      if (!token || token !== process.env.MP_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Backend sem configuração obrigatória' });
    }

    // O MP envia JSON. Se vier string, tenta parsear.
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { type, data } = body;

    let reservaId = null;
    let pago = false;

    // 1) Descobrir status e external_reference
    if (type === 'payment' && data?.id) {
      const pay = await getPaymentById(data.id, MP_ACCESS_TOKEN);
      pago = pay.status === 'approved';
      reservaId = pay.external_reference || pay.order?.external_reference || null;
    } else if (type === 'merchant_order' && data?.id) {
      const mo = await getMerchantOrderById(data.id, MP_ACCESS_TOKEN);
      const paid = (mo.payments || []).filter(p => p.status === 'approved')
                      .reduce((s,p)=>s + (p.transaction_amount||0), 0);
      pago = paid >= (mo.total_amount || 0);
      reservaId = mo.external_reference || null;
    } else {
      // Outros tipos ignoramos em silêncio
      return res.status(200).json({ ok: true, skipped: true });
    }

    if (!reservaId) return res.status(200).json({ ok: true, skipped: 'missing_external_reference' });
    if (!pago)      return res.status(200).json({ ok: true, skipped: 'not_approved' });

    // 2) Buscar reserva
    const reserva = await fetchReservaById(reservaId, SUPABASE_SERVICE_KEY, SUPABASE_URL);
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada' });

    // 3) Atualizar status = confirmada (idempotente — PATCH repetido não quebra)
    await updateReservaStatusConfirmada(reservaId, SUPABASE_SERVICE_KEY, SUPABASE_URL);

    // 4) Bloquear no Calendar (se configurado)
    const mapBySlug = {
      'flat-1': process.env.GCALE_FLAT1_ID,
      'flat-2': process.env.GCALE_FLAT2_ID,
      'flat-3': process.env.GCALE_FLAT3_ID,
      'flat-4': process.env.GCALE_FLAT4_ID
    };
    const calendarId = mapBySlug[reserva.flat_slug];

    if (calendarId && process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY) {
      const accessToken = await getGoogleAccessToken();

      // Horários fixos na TZ de Fortaleza
      const startISO = `${reserva.checkin}T14:00:00-03:00`;
      const endISO   = `${reserva.checkout}T12:00:00-03:00`;

      await createCalendarEvent({
        calendarId,
        summary: `Reserva confirmada — ${reserva.hospede_nome}`,
        description: `Flat: ${reserva.flat_slug}\nPeríodo: ${reserva.checkin} → ${reserva.checkout}\nTotal: R$ ${Number(reserva.total).toFixed(2)}`,
        startISO,
        endISO,
        reservaId,
        accessToken
      });
    }

    return res.status(200).json({ ok: true, reservaId, status: 'confirmada' });
  } catch (e) {
    return res.status(500).json({ error: 'Erro webhook', detail: String(e?.message || e) });
  }
}
