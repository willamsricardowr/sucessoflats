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

  // helpers
  const toYMD = (v) => {
    const d = new Date(`${String(v)}T00:00:00Z`);
    return d.toISOString().slice(0,10); // YYYY-MM-DD
  };
  const nowISO = () => new Date().toISOString();
  const plusMinutes = (min) => new Date(Date.now() + min*60*1000).toISOString();

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

    const {
      flat_id, flat_slug, flat_nome,
      checkin, checkout,
      noites, preco_noite, total,
      hospede
    } = payload;

    // normalizar datas (YYYY-MM-DD) e validar período
    const ciStr = toYMD(checkin);
    const coStr = toYMD(checkout);
    const ci = new Date(`${ciStr}T00:00:00Z`);
    const co = new Date(`${coStr}T00:00:00Z`);
    if (!(co > ci)) {
      return res.status(400).json({ error: 'Período inválido (checkout deve ser após checkin)' });
    }

    // 1) Buscar possíveis conflitos do mesmo flat
    // Buscamos pendentes/confirmadas/pagas e filtramos overlap em código
    const listUrl = new URL(`${SUPABASE_URL}/rest/v1/reservas`);
    listUrl.searchParams.set('select', 'id,checkin,checkout,status,hospede_email,expira_em,created_at');
    listUrl.searchParams.set('flat_id', `eq.${flat_id}`);
    // Se sua tabela usar outros nomes de status, inclua aqui:
    listUrl.searchParams.set('status', 'in.(pendente,confirmada,pago)');
    const r = await fetch(listUrl, { headers: sHeaders });
    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: 'Falha ao consultar reservas', detail: t });
    }
    const existing = await r.json();

    const now = new Date(nowISO());

    // Função de overlap: [checkin, checkout)
    const overlap = (Aci, Aco, Bci, Bco) => (Aci < Bco) && (Aco > Bci);

    // 2) Filtrar apenas as que de fato bloqueiam
    // - 'confirmada' e 'pago' SEMPRE bloqueiam
    // - 'pendente' só bloqueia se NÃO estiver expirada (expira_em > agora) ou se não tiver expira_em
    const blockers = existing.filter(rx => {
      const Aci = new Date(`${rx.checkin}T00:00:00Z`);
      const Aco = new Date(`${rx.checkout}T00:00:00Z`);
      const status = String(rx.status || '').toLowerCase();

      const isOverlap = overlap(Aci, Aco, ci, co);
      if (!isOverlap) return false;

      if (status === 'confirmada' || status === 'pago') return true;

      if (status === 'pendente') {
        if (!rx.expira_em) return true; // sem expiração definida => ainda bloqueia
        const exp = new Date(rx.expira_em);
        return exp > now; // só bloqueia se não expirou
      }

      return false;
    });

    // 3) Se há bloqueio, ver se dá pra REAPROVEITAR reserva pendente do mesmo e-mail
    if (blockers.length) {
      const samePersonPending = blockers.find(rx =>
        String(rx.status).toLowerCase() === 'pendente' &&
        (rx.expira_em ? new Date(rx.expira_em) > now : true) &&
        String(rx.hospede_email || '').toLowerCase() === String(hospede.email || '').toLowerCase()
      );

      if (samePersonPending) {
        return res.status(200).json({
          ok: true,
          reserva: {
            id: samePersonPending.id,
            checkin: ciStr,
            checkout: coStr,
            total: Number(total),
            flat_nome,
            reuse: true
          },
          mensagem: 'Já existe uma reserva pendente para este período. Vamos retomar o pagamento.'
        });
      }

      // Outro hóspede ou já confirmada/paga → bloquear
      return res.status(409).json({ error: 'Conflito de datas', code: 'DATE_CONFLICT' });
    }

    // 4) Inserir pendente nova (com expiração de 30 minutos)
    const insertUrl = new URL(`${SUPABASE_URL}/rest/v1/reservas`);
    const body = {
      flat_id,
      flat_slug,
      flat_nome,
      checkin: ciStr,
      checkout: coStr,
      noites: Number(noites),
      preco_noite: Number(preco_noite),
      total: Number(total),
      hospede_nome: hospede.nome,
      hospede_email: hospede.email,
      hospede_telefone: hospede.telefone,
      hospedes: Number(hospede.hospedes),
      hora_chegada: hospede.hora_chegada,
      obs: hospede.obs || null,
      status: 'pendente',
      expira_em: plusMinutes(30) // ⏱️ pendente vale por 30 min
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

    // 5) (Opcional) Enviar e-mail (se tiver RESEND_API_KEY)
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
            to: [hospede.email],
            subject: `Reserva pendente • ${flat_nome}`,
            text: [
              `Olá, ${hospede.nome}.`,
              `Recebemos sua solicitação de reserva no ${flat_nome}.`,
              `Período: ${ciStr} → ${coStr} (${Number(noites)} noite(s))`,
              `Total: R$ ${Number(total).toFixed(2)}`,
              ``,
              `Sua reserva está PENDENTE por até 30 minutos, até a confirmação do pagamento.`,
              `Após esse prazo, as datas podem ser liberadas automaticamente.`,
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
