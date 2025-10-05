// api/reservas/criar.js
export default async function handler(req, res) {
  // ✅ CORS: permite testar local chamando a API da Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Backend sem configuração Supabase' });
  }

  const sHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    const payload = req.body || {};
    const required = [
      'flat_id','flat_slug','flat_nome','checkin','checkout','noites',
      'preco_noite','total','hospede.nome','hospede.email','hospede.telefone',
      'hospede.hospedes','hospede.hora_chegada'
    ];
    for (const key of required) {
      const val = key.split('.').reduce((acc,k)=>acc?.[k], payload);
      if (val === undefined || val === null || val === '') {
        return res.status(400).json({ error: `Campo obrigatório ausente: ${key}` });
      }
    }

    const { flat_id, flat_slug, checkin, checkout } = payload;
    const noites = Number(payload.noites);
    const preco_noite = Number(payload.preco_noite);
    const total = Number(payload.total);

    const ci = new Date(`${checkin}T00:00:00Z`);
    const co = new Date(`${checkout}T00:00:00Z`);
    if (!(co > ci)) {
      return res.status(400).json({ error: 'Período inválido (checkout deve ser após checkin)' });
    }

    // 1) Buscar existentes (pendente/confirmada)
    const listUrl = new URL(`${SUPABASE_URL}/rest/v1/reservas`);
    listUrl.searchParams.set('select', 'id,checkin,checkout,status');
    listUrl.searchParams.set('flat_id', `eq.${flat_id}`);
    listUrl.searchParams.set('status', 'in.(pendente,confirmada)');
    const r = await fetch(listUrl, { headers: sHeaders });
    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: 'Falha ao consultar reservas', detail: t });
    }
    const existing = await r.json();

    // 2) Overlap exclusivo (permite back-to-back)
    const hasOverlap = existing.some(rx => {
      const Astart = new Date(`${rx.checkin}T00:00:00Z`);
      const Aend   = new Date(`${rx.checkout}T00:00:00Z`);
      return (Astart < co) && (Aend > ci);
    });
    if (hasOverlap) {
      return res.status(409).json({ error: 'Conflito de datas', code: 'DATE_CONFLICT' });
    }

    // 3) Inserir pendente
    const insertUrl = new URL(`${SUPABASE_URL}/rest/v1/reservas`);
    const body = {
      flat_id,
      flat_slug,
      checkin,
      checkout,
      noites,
      preco_noite,
      total,
      hospede_nome: payload.hospede.nome,
      hospede_email: payload.hospede.email,
      hospede_telefone: payload.hospede.telefone,
      hospedes: Number(payload.hospede.hospedes),
      hora_chegada: payload.hospede.hora_chegada,
      obs: payload.hospede.obs || null,
      status: 'pendente'
    };

    const ins = await fetch(insertUrl, {
      method: 'POST',
      headers: { ...sHeaders, Prefer: 'return=representation' },
      body: JSON.stringify(body)
    });
    if (!ins.ok) {
      const txt = await ins.text();
      return res.status(500).json({ error: 'Falha ao criar reserva', detail: txt });
    }
    const [created] = await ins.json();

    // 4) (Opcional) Enviar e-mail (se tiver RESEND_API_KEY)
    let emailStatus = 'skipped';
    if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      try {
        const emailResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: [payload.hospede.email],
            subject: `Reserva pendente • ${payload.flat_nome}`,
            text: [
              `Olá, ${payload.hospede.nome}.`,
              `Recebemos sua solicitação de reserva no ${payload.flat_nome}.`,
              `Período: ${checkin} → ${checkout} (${noites} noite(s))`,
              `Total: R$ ${total.toFixed(2)}`,
              ``,
              `Sua reserva está PENDENTE até a confirmação do pagamento.`,
              `Política: Cancelamento grátis até 48h antes.`,
              ``,
              `Sucesso Flat's`
            ].join('\n')
          })
        });
        emailStatus = emailResp.ok ? 'sent' : 'failed';
      } catch {
        emailStatus = 'failed';
      }
    }

    return res.status(201).json({ ok: true, reserva: created, emailStatus });
  } catch (e) {
    return res.status(500).json({ error: 'Erro inesperado', detail: String(e?.message || e) });
  }
}
