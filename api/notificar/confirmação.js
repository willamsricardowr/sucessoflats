// api/notificar/confirmacao.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const id = req.query.id || req.body?.id;
  if (!id) return res.status(400).json({ error: 'Informe ?id=' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !KEY) return res.status(500).json({ error: 'Backend sem Supabase' });

  try {
    const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/reservas?select=*&id=eq.${id}`, { headers });
    const arr = await r.json();
    const reserva = arr[0];
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (reserva.status !== 'confirmada') return res.status(409).json({ error: 'Reserva não está confirmada' });

    const { buildICS } = await import('../api/_lib/ics.js');
    const { sendMail } = await import('../api/_lib/email.js');

    const startISO = `${reserva.checkin}T14:00:00-03:00`;
    const endISO   = `${reserva.checkout}T12:00:00-03:00`;
    const ics = buildICS({
      summary: `Estadia — Sucesso Flat’s (${reserva.flat_slug})`,
      description: `Reserva CONFIRMADA\nPeríodo: ${reserva.checkin} → ${reserva.checkout}`,
      startISO, endISO,
      uid: `reserva-${reserva.id}@sucessoflats`
    });

    await sendMail({
      to: reserva.hospede_email,
      subject: `Reenvio — Reserva confirmada ${reserva.checkin} → ${reserva.checkout}`,
      text: 'Segue sua confirmação e o anexo .ics.',
      html: '<p>Reenvio da confirmação.</p>',
      idempotencyKey: `email-retry-${reserva.id}-${Date.now()}`,
      attachments: [{ filename: 'sucessoflats.ics', content: Buffer.from(ics).toString('base64') }]
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao reenviar', detail: String(e) });
  }
}
