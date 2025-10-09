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
    Buffer.from(JSON.stringify(obj)).toString('base64')
      .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const signingInput = `${b64url(header)}.${b64url(claims)}`;
  const sign = crypto.createSign('RSA-SHA256');
  const pk = (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  sign.update(signingInput);
  const signature = sign.sign(pk).toString('base64')
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
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
  url.searchParams.set('privateExtendedProperty', `reservaId=${reservaId}`);
  url.searchParams.set('maxResults', '2');
  url.searchParams.set('singleEvents', 'true');
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }});
  if (!resp.ok) throw new Error(`Falha ao buscar evento existente: ${await resp.text()}`);
  const data = await resp.json();
  return (data.items || [])[0] || null;
}
async function createCalendarEvent({ calendarId, summary, description, startISO, endISO, reservaId, accessToken }) {
  const existing = await findCalendarEventByReserva({ calendarId, reservaId, startISO, endISO, accessToken });
  if (existing) return existing;
  const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary, description,
      start: { dateTime: startISO, timeZone: 'America/Fortaleza' },
      end:   { dateTime: endISO,   timeZone: 'America/Fortaleza' },
      extendedProperties: { private: { reservaId: String(reservaId) } }
    })
  });
  if (!resp.ok) throw new Error(`Falha ao criar evento: ${await resp.text()}`);
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

/** ========= HANDLER ========= */
export default async function handler(req, res) {
  // Nunca devolve 401/405/500 para o MP (para não bloquear entregas)
  try {
    console.log('[MP Webhook] hit:', { method: req.method, ua: req.headers['user-agent'] });

    if (req.method !== 'POST') {
      console.log('[MP Webhook] not POST, skipping');
      return res.status(200).json({ ok: true, skipped: 'not_post' });
    }

    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.warn('[MP Webhook] vars ausentes');
      return res.status(200).json({ ok: false, skipped: 'missing_env' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const typeRaw = body?.type || body?.topic || body?.action || '';
    const type = typeof typeRaw === 'string' ? typeRaw.split('.')[0] : typeRaw;
    const dataId = body?.data?.id || body?.resource || body?.id;

    // Ignora teste de URL do MP
    const isMpUrlTest = body?.live_mode === false || String(dataId) === '123456';
    if (isMpUrlTest) {
      console.log('[MP Webhook] URL test received');
      return res.status(200).json({ ok: true, test: 'mp_webhook_url_check' });
    }

    let reservaId = null;
    let pago = false;

    // 1) Descobrir status e external_reference (tolerante)
    if (type === 'payment' && dataId) {
      let pay = null;
      try { pay = await getPaymentById(dataId, MP_ACCESS_TOKEN); }
      catch (err) { console.warn('[MP Webhook] payment lookup falhou:', String(err)); }
      if (!pay) return res.status(200).json({ ok: true, skipped: 'payment_not_found' });

      pago = pay.status === 'approved';
      reservaId = pay.external_reference || pay.order?.external_reference || null;
      console.log('[MP Webhook] payment', dataId, 'status=', pay.status, 'ext=', reservaId);
    } else if (type === 'merchant_order' && dataId) {
      let mo = null;
      try { mo = await getMerchantOrderById(dataId, MP_ACCESS_TOKEN); }
      catch (err) { console.warn('[MP Webhook] merchant_order lookup falhou:', String(err)); }
      if (!mo) return res.status(200).json({ ok: true, skipped: 'merchant_order_not_found' });

      const paid = (mo.payments || []).filter(p => p.status === 'approved')
        .reduce((s,p)=>s + (p.transaction_amount||0), 0);
      pago = paid >= (mo.total_amount || 0);
      reservaId = mo.external_reference || null;
      console.log('[MP Webhook] merchant_order', dataId, 'paid=', paid, 'total=', mo.total_amount, 'ext=', reservaId);
    } else {
      return res.status(200).json({ ok: true, skipped: 'unknown_type' });
    }

    if (!reservaId) return res.status(200).json({ ok: true, skipped: 'missing_external_reference' });
    if (!pago)      return res.status(200).json({ ok: true, skipped: 'not_approved' });

    // 2) Buscar reserva e confirmar
    const reserva = await fetchReservaById(reservaId, SUPABASE_SERVICE_KEY, SUPABASE_URL);
    if (!reserva) return res.status(200).json({ ok: true, skipped: 'reserva_not_found' });

    await updateReservaStatusConfirmada(reservaId, SUPABASE_SERVICE_KEY, SUPABASE_URL);

    // 3) E-mail + .ics (resiliente)
    try {
      const { buildICS } = await import('../_lib/ics.js');
      const { sendMail } = await import('../_lib/email.js');

      const startISO = `${reserva.checkin}T14:00:00-03:00`;
      const endISO   = `${reserva.checkout}T12:00:00-03:00`;

      const ics = buildICS({
        summary: `Estadia — Sucesso Flat’s (${reserva.flat_slug})`,
        description: [
          `Reserva CONFIRMADA ✅`,
          `Hóspede: ${reserva.hospede_nome}`,
          `Período: ${reserva.checkin} → ${reserva.checkout}`,
          `Check-in: 14:00 • Check-out: 12:00`,
          `Total: R$ ${Number(reserva.total).toFixed(2)}`,
          ``,
          `Instruções de check-in:`,
          `• Apresente documento com foto;`,
          `• Silêncio após 22h;`,
          ``,
          `Política: Cancelamento grátis até 48h antes.`,
          `Sucesso Flat’s`
        ].join('\n'),
        startISO, endISO,
        uid: `reserva-${reserva.id}@sucessoflats`
      });

      let html, text;
      try {
        const { buildHtml, buildText } = await import('../_lib/templates/confirmacao.js');
        html = buildHtml(reserva, {
          logoUrl: 'https://sucessoflats.vercel.app/public/logo-sucesso.png',
          site: 'https://sucessoflats.vercel.app',
          supportEmail: 'sucessoflats@gmail.com',
          whatsapp: '+55 86 9 8175-0070',
          address: 'Teresina/PI',
          primary: '#C9A44A', accent: '#B87333', text: '#0F172A',
          subtle: '#64748B', bg: '#F7F7F9', card: '#FFFFFF', border: '#E5E7EB'
        });
        text = buildText(reserva, { supportEmail: 'sucessoflats@gmail.com', whatsapp: '+55 86 9 8175-0070', address: 'Teresina/PI' });
      } catch {
        html = `
          <p>Olá, <strong>${reserva.hospede_nome}</strong>!</p>
          <p>Sua reserva foi <strong>confirmada</strong> 🎉</p>
          <ul>
            <li><b>Flat:</b> ${reserva.flat_slug}</li>
            <li><b>Período:</b> ${reserva.checkin} → ${reserva.checkout}</li>
            <li><b>Check-in:</b> 14:00 • <b>Check-out:</b> 12:00</li>
            <li><b>Total:</b> R$ ${Number(reserva.total).toFixed(2)}</li>
          </ul>
          <p>Adicione ao seu calendário com o anexo <code>sucessoflats.ics</code>.</p>
          <p>— Sucesso Flat’s</p>`;
        text = [
          `Sua reserva foi confirmada.`,
          `Flat: ${reserva.flat_slug}`,
          `Período: ${reserva.checkin} → ${reserva.checkout}`,
          `Check-in 14:00 • Check-out 12:00`,
          `Total: R$ ${Number(reserva.total).toFixed(2)}`
        ].join('\n');
      }

      await sendMail({
        to: reserva.hospede_email,
        subject: `Reserva confirmada — ${reserva.checkin} → ${reserva.checkout}`,
        text, html,
        attachments: [{ filename: 'sucessoflats.ics', content: Buffer.from(ics).toString('base64'), type: 'text/calendar', disposition: 'attachment' }]
      });
      console.log('[MP Webhook] e-mail enviado para', reserva.hospede_email);
    } catch (err) {
      console.warn('[MP Webhook] falha e-mail:', String(err));
    }

    // 4) Calendário
    try {
      const mapBySlug = {
        'flat-1': process.env.GCALE_FLAT1_ID,
        'flat-2': process.env.GCALE_FLAT2_ID,
        'flat-3': process.env.GCALE_FLAT3_ID,
        'flat-4': process.env.GCALE_FLAT4_ID
      };
      const calendarId = mapBySlug[reserva.flat_slug];
      if (calendarId && process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY) {
        const accessToken = await getGoogleAccessToken();
        const startISO = `${reserva.checkin}T14:00:00-03:00`;
        const endISO   = `${reserva.checkout}T12:00:00-03:00`;
        await createCalendarEvent({
          calendarId,
          summary: `Reserva confirmada — ${reserva.hospede_nome}`,
          description: `Flat: ${reserva.flat_slug}\nPeríodo: ${reserva.checkin} → ${reserva.checkout}\nTotal: R$ ${Number(reserva.total).toFixed(2)}`,
          startISO, endISO, reservaId, accessToken
        });
        console.log('[MP Webhook] calendário bloqueado', reserva.flat_slug, startISO, '→', endISO);
      }
    } catch (err) {
      console.warn('[MP Webhook] falha calendar:', String(err));
    }

    return res.status(200).json({ ok: true, reservaId, status: 'confirmada' });
  } catch (e) {
    console.error('[MP Webhook] erro inesperado:', e);
    // Mesmo em erro inesperado, responder 200 para não tomar 401/500 no MP
    return res.status(200).json({ ok: false, skipped: 'unexpected_error' });
  }
}
