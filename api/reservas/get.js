// api/reservas/get.js
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Informe ?id=' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !KEY) return res.status(500).json({ error: 'Backend sem Supabase' });

  try {
    const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/reservas?select=id,status,hospede_nome,hospede_email,flat_slug,checkin,checkout,total&id=eq.${id}`, { headers });
    if (!r.ok) return res.status(500).json({ error: 'Falha ao consultar', detail: await r.text() });
    const arr = await r.json();
    const reserva = arr[0];
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada' });
    return res.status(200).json(reserva);
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detail: String(e?.message || e) });
  }
}
