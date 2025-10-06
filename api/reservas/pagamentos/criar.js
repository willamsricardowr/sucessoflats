// api/pagamentos/criar.js

export default async function handler(req, res) {
  // 1️⃣ Permitir apenas requisições POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2️⃣ Ler as variáveis de ambiente
  const { MP_ACCESS_TOKEN, MP_BACK_URL_SUCCESS, MP_BACK_URL_FAILURE, MP_BACK_URL_PENDING } = process.env;

  if (!MP_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'MP_ACCESS_TOKEN ausente no backend' });
  }

  try {
    // 3️⃣ Ler os dados enviados do front (reserva)
    const payload = req.body;

    // Verificar se veio tudo que precisa
    if (!payload?.reserva?.id || !payload?.reserva?.total || !payload?.reserva?.flat_nome) {
      return res.status(400).json({ error: 'Payload inválido' });
    }

    // 4️⃣ Montar o corpo da requisição que vai pro Mercado Pago
    const body = {
      items: [
        {
          title: `Reserva — ${payload.reserva.flat_nome}`,
          quantity: 1,
          unit_price: Number(payload.reserva.total),
          currency_id: 'BRL',
        },
      ],
      payer: {
        name: payload.reserva.hospede_nome,
        email: payload.reserva.hospede_email,
      },
      back_urls: {
        success: MP_BACK_URL_SUCCESS,
        failure: MP_BACK_URL_FAILURE,
        pending: MP_BACK_URL_PENDING,
      },
      auto_return: 'approved',
      external_reference: payload.reserva.id,
      payment_methods: {
        excluded_payment_types: [],
        installments: 1,
      },
    };

    // 5️⃣ Enviar pro Mercado Pago pra criar a "preferência de pagamento"
    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // 6️⃣ Tratar possíveis erros da API do Mercado Pago
    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(500).json({ error: 'Falha ao criar preferência', detail: txt });
    }

    // 7️⃣ Retornar o link do checkout para o frontend
    const pref = await resp.json();

    return res.status(201).json({
      ok: true,
      init_point: pref.init_point || pref.sandbox_init_point, // usa sandbox se for teste
      preference_id: pref.id,
    });
  } catch (e) {
    // 8️⃣ Qualquer erro inesperado cai aqui
    return res.status(500).json({ error: 'Erro interno', detail: String(e) });
  }
}
