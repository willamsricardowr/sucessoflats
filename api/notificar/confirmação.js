// api/notificar/confirmacao.js
export default async function handler(req, res) {
  // Só POST (evita reenvios acidentais por GET)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = req.query.id || req.body?.id;
  if (!id) return res.status(400).json({ error: 'Informe ?id=' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !KEY) {
    return res.status(500).json({ error: 'Backend sem Supabase (variáveis ausentes)' });
  }

  try {
    // 1) Buscar a reserva confirmada
    const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/reservas?select=*&id=eq.${id}`, { headers });
    if (!r.ok) {
      return res.status(500).json({ error: 'Falha ao consultar reserva', detail: await r.text() });
    }
    const arr = await r.json();
    const reserva = arr[0];
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (reserva.status !== 'confirmada') {
      return res.status(409).json({ error: 'Reserva não está confirmada' });
    }
    if (!reserva.hospede_email) {
      return res.status(422).json({ error: 'Reserva não possui e-mail do hóspede' });
    }

    // 2) Geração do .ics
    const { buildICS } = await import('../_lib/ics.js');
    const startISO = `${reserva.checkin}T14:00:00-03:00`;
    const endISO   = `${reserva.checkout}T12:00:00-03:00`;
    const ics = buildICS({
      summary: `Estadia — Sucesso Flat’s (${reserva.flat_slug})`,
      description: [
        `Reserva CONFIRMADA`,
        `Período: ${reserva.checkin} → ${reserva.checkout}`,
        `Check-in: 14:00 • Check-out: 12:00`,
        `Total: R$ ${Number(reserva.total).toFixed(2)}`
      ].join('\n'),
      startISO,
      endISO,
      uid: `reserva-${reserva.id}@sucessoflats`
    });

    // 3) Montar e enviar e-mail (template moderno)
    const { sendMail } = await import('../_lib/email.js');

    let html, text;
    try {
      const { buildHtml, buildText } = await import('../_lib/templates/confirmacao.js');

      const brand = {
        name: "Sucesso Flat’s",
        // Projeto estático: use /public no caminho absoluto
        logoUrl: "https://sucessoflats.vercel.app/public/logo-sucesso.png",
        site: "https://sucessoflats.vercel.app",
        supportEmail: "sucessoflats@gmail.com",
        whatsapp: "+55 86 9 8175-0070",
        address: "Teresina/PI",
        primary: "#C9A44A",
        accent: "#B87333",
        text: "#0F172A",
        subtle: "#64748B",
        bg: "#F7F7F9",
        card: "#FFFFFF",
        border: "#E5E7EB"
      };

      html = buildHtml(reserva, brand);
      text = buildText(reserva, brand);

    } catch {
      // Fallback simples se o template não estiver no projeto
      html = `
        <p>Olá, <strong>${reserva.hospede_nome}</strong>!</p>
        <p>Reenvio da confirmação da sua reserva.</p>
        <ul>
          <li><b>Flat:</b> ${reserva.flat_slug}</li>
          <li><b>Período:</b> ${reserva.checkin} → ${reserva.checkout}</li>
          <li><b>Check-in:</b> 14:00 • <b>Check-out:</b> 12:00</li>
          <li><b>Total:</b> R$ ${Number(reserva.total).toFixed(2)}</li>
        </ul>
        <p>Anexamos o arquivo <code>sucessoflats.ics</code> para adicionar ao seu calendário.</p>
        <p>— Sucesso Flat’s</p>
      `;
      text = [
        `Reenvio da confirmação.`,
        `Flat: ${reserva.flat_slug}`,
        `Período: ${reserva.checkin} → ${reserva.checkout}`,
        `Check-in 14:00 • Check-out 12:00`,
        `Total: R$ ${Number(reserva.total).toFixed(2)}`
      ].join('\n');
    }

    await sendMail({
      to: reserva.hospede_email,
      subject: `Reenvio — Reserva confirmada ${reserva.checkin} → ${reserva.checkout}`,
      text,
      html,
      idempotencyKey: `email-retry-${reserva.id}-${Date.now()}`,
      attachments: [
        {
          filename: 'sucessoflats.ics',
          content: Buffer.from(ics).toString('base64')
          // Para Resend, não precisa "type" nem "disposition"
        }
      ]
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao reenviar', detail: String(e?.message || e) });
  }
}
