// api/pagamentos/criar.js

export default async function handler(req, res) {
  // 0️⃣ — Permitir apenas POST e CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1️⃣ — Variáveis de ambiente obrigatórias
  const {
    MP_ACCESS_TOKEN,
    MP_BACK_URL_SUCCESS,
    MP_BACK_URL_FAILURE,
    MP_BACK_URL_PENDING,
    APP_BASE_URL,
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY
  } = process.env;

  if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Variáveis de ambiente ausentes (MP ou Supabase)' });
  }

  // 2️⃣ — Domínio base (para back_urls e webhook)
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
  const base = APP_BASE_URL || vercelUrl;

  const successURL = MP_BACK_URL_SUCCESS || `${base}/src/pages/sucesso.html`;
  const failureURL = MP_BACK_URL_FAILURE || `${base}/src/pages/erro.html`;
  const pendingURL = MP_BACK_URL_PENDING || `${base}/src/pages/pendente.html`;

  try {
    // 3️⃣ — Payload recebido do front
    const payload = req.body;
    const { flat_id, flat_nome, checkin, checkout, total, hospede_nome, hospede_email } = payload || {};

    if (!flat_id || !flat_nome || !checkin || !checkout || !total || !hospede_nome || !hospede_email) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes no corpo da requisição.' });
    }

    // 4️⃣ — HEADERS padrão Supabase
    const headers = {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    };

    // 5️⃣ — Verifica se já há reserva no mesmo período (controle de concorrência)
    const overlapUrl = new URL(`${SUPABASE_URL}/rest/v1/reservas`);
    overlapUrl.searchParams.set('select', 'id');
    overlapUrl.searchParams.set('flat_id', `eq.${flat_id}`);
    overlapUrl.searchParams.set('status', 'in.(pendente,confirmada)');
    overlapUrl.searchParams.set('or', `(checkin.lte.${checkout},checkout.gte.${checkin})`);

    const overlapRes = await fetch(overlapUrl, { headers });
    const overlap = await overlapRes.json();
    if (overlap.length > 0) {
      return res.status(409).json({ error: 'Período indisponível para este flat.' });
    }

    // 6️⃣ — Cria a reserva no Supabase com status pendente
    const reservaRes = await fetch(`${SUPABASE_URL}/rest/v1/reservas`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        flat_id,
        flat_nome,
        checkin,
        checkout,
        total,
        hospede_nome,
        hospede_email,
        status: 'pendente'
      })
    });

    if (!reservaRes.ok) {
      const detail = await reservaRes.text();
      return res.status(500).json({ error: 'Falha ao criar reserva no Supabase', detail });
    }

    const reservaData = await reservaRes.json();
    const reserva = reservaData[0];

    if (!reserva?.id) {
      return res.status(500).json({ error: 'Erro ao obter ID da reserva criada.' });
    }

    // 7️⃣ — Cria a preferência de pagamento no Mercado Pago
    const descricao = `Reserva — ${flat_nome} • ${checkin} → ${checkout}`;
    const valor = Math.max(0.01, Math.round(Number(total) * 100) / 100);

    const mpBody = {
      items: [
        {
          title: descricao,
          quantity: 1,
          unit_price: valor,
          currency_id: 'BRL'
        }
      ],
      payer: {
        name: hospede_nome,
        email: hospede_email
      },
      back_urls: {
        success: successURL,
        failure: failureURL,
        pending: pendingURL
      },
      auto_return: 'approved',
      external_reference: reserva.id, // vínculo direto
      payment_methods: {
        excluded_payment_types: [],
        installments: 1
      },
      metadata: {
        reserva_id: reserva.id,
        flat_id,
        checkin,
        checkout
      },
      notification_url: `${base}/api/pagamentos/webhook`
    };

    const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mpBody)
    });

    if (!mpResp.ok) {
      const txt = await mpResp.text();
      return res.status(500).json({ error: 'Falha ao criar preferência MP', detail: txt });
    }

    const pref = await mpResp.json();

    // 8️⃣ — Retorna o link do checkout e o ID da reserva
    return res.status(201).json({
      ok: true,
      reserva_id: reserva.id,
      preference_id: pref.id,
      init_point: pref.init_point || pref.sandbox_init_point
    });

  } catch (e) {
    console.error('Erro interno em /api/pagamentos/criar:', e);
    return res.status(500).json({ error: 'Erro interno', detail: String(e) });
  }
}
