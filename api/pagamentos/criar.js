// api/pagamentos/criar.js

export default async function handler(req, res) {
  // 0) Opcional: libera preflight se um dia chamar de outro domínio
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  // 1) Permitir apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2) Variáveis de ambiente
  const {
    MP_ACCESS_TOKEN,
    MP_BACK_URL_SUCCESS,
    MP_BACK_URL_FAILURE,
    MP_BACK_URL_PENDING,
    APP_BASE_URL,              // opcional: ex. https://sucessoflats.com.br
  } = process.env;

  if (!MP_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'MP_ACCESS_TOKEN ausente no backend' });
  }

  // Descobrir domínio base automaticamente se precisar (ex.: sucessoflats.vercel.app)
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
  const base = APP_BASE_URL || vercelUrl;

  // Fallbacks seguros para as back_urls
  const successURL = MP_BACK_URL_SUCCESS || (base ? `${base}/src/pages/sucesso.html` : undefined);
  const failureURL = MP_BACK_URL_FAILURE || (base ? `${base}/src/pages/erro.html` : undefined);
  const pendingURL = MP_BACK_URL_PENDING || (base ? `${base}/src/pages/pendente.html` : undefined);

  try {
    // 3) Payload do front
    const payload = req.body;

    // Checagens mínimas
    const reserva = payload?.reserva || {};
    const { id, total, flat_nome, hospede_nome, hospede_email, flat_id, checkin, checkout } = reserva || {};

    if (!id || total == null || !flat_nome) {
      return res.status(400).json({ error: 'Payload inválido: id, total e flat_nome são obrigatórios.' });
    }

    // Normalizar valor
    let valor = Number(total);
    if (!Number.isFinite(valor)) {
      return res.status(400).json({ error: 'Valor total inválido.' });
    }
    // arredonda para 2 casas e garante mínimo de 1 centavo
    valor = Math.max(0.01, Math.round(valor * 100) / 100);

    // Descrição amigável (se tiver datas)
    const descricao =
      checkin && checkout
        ? `Reserva — ${flat_nome} • ${checkin} → ${checkout}`
        : `Reserva — ${flat_nome}`;

    // 4) Montar a preferência do MP
    const body = {
      items: [
        {
          title: descricao,
          quantity: 1,
          unit_price: valor,
          currency_id: 'BRL',
        },
      ],
      payer: {
        name: hospede_nome || '',
        email: hospede_email || '',
      },
      back_urls: {
        success: successURL,
        failure: failureURL,
        pending: pendingURL,
      },
      auto_return: 'approved',
      external_reference: id, // importante para conciliação
      payment_methods: {
        excluded_payment_types: [], // Mantém PIX e Cartão habilitados
        installments: 1,            // à vista; se quiser permitir parcelas, altere aqui
      },
      // Metadados úteis para consulta futura
      metadata: {
        reserva_id: id,
        flat_id: flat_id || null,
        checkin: checkin || null,
        checkout: checkout || null,
      },
      // Para o Passo 10 (webhook). Se não existir base, não envia.
      ...(base && {
        notification_url: `${base}/api/pagamentos/webhook`,
      }),
    };

    // 5) Criar preferência
    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // 6) Tratar erro do MP
    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(500).json({ error: 'Falha ao criar preferência', detail: txt });
    }

    // 7) Responder ao front
    const pref = await resp.json();
    return res.status(201).json({
      ok: true,
      preference_id: pref.id,
      init_point: pref.init_point || pref.sandbox_init_point, // funciona em prod e sandbox
    });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detail: String(e) });
  }
}
