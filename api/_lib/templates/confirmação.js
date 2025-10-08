// api/_lib/templates/confirmacao.js
// Template "bulletproof" baseado em tabelas (compatível Outlook)

function currencyBRL(v) {
  const n = Number(v || 0);
  try { return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  catch { return `R$ ${n.toFixed(2)}`; }
}

export function buildText(reserva, brand = {}) {
  const b = {
    name: brand.name || "Sucesso Flat’s",
    supportEmail: brand.supportEmail || 'sucessoflats@gmail.com',
    whatsapp: brand.whatsapp || '+55 86 9 8175-0070',
    address: brand.address || 'Teresina/PI',
  };

  return [
    `Olá, ${reserva.hospede_nome}!`,
    `Sua reserva foi CONFIRMADA 🎉`,
    ``,
    `Flat: ${reserva.flat_slug}`,
    `Período: ${reserva.checkin} → ${reserva.checkout}`,
    `Check-in: 14:00 • Check-out: 12:00`,
    `Total: ${currencyBRL(reserva.total)}`,
    ``,
    `Instruções de check-in:`,
    `• Apresente documento com foto na chegada;`,
    `• Silêncio após 22h.`,
    ``,
    `Política: Cancelamento grátis até 48h antes.`,
    ``,
    `Adicione ao seu calendário com o anexo "sucessoflats.ics".`,
    ``,
    `Qualquer dúvida, fale com a gente:`,
    `WhatsApp: ${b.whatsapp}`,
    `E-mail: ${b.supportEmail}`,
    `${b.name} — ${b.address}`
  ].join('\n');
}

export function buildHtml(reserva, brand = {}) {
  // Paleta Gold & Graphite
  const b = {
    name: brand.name || "Sucesso Flat’s",
    // Projeto estático: usar /public no caminho absoluto
    logoUrl: brand.logoUrl || 'https://sucessoflats.vercel.app/public/logo-sucesso.png',
    primary: brand.primary || '#C9A44A',  // ouro (destaques)
    accent:  brand.accent  || '#B87333',  // bronze (gradiente/cta)
    text:    brand.text    || '#0F172A',  // grafite-ink
    subtle:  brand.subtle  || '#64748B',  // cinza sutil
    bg:      brand.bg      || '#F7F7F9',  // fundo claro
    card:    brand.card    || '#FFFFFF',
    border:  brand.border  || '#E5E7EB',
    supportEmail: brand.supportEmail || 'sucessoflats@gmail.com',
    whatsapp: brand.whatsapp || '+55 86 9 8175-0070',
    address: brand.address || 'Teresina/PI',
    site: brand.site || 'https://sucessoflats.vercel.app',
  };

  const total = currencyBRL(reserva.total);

  return `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reserva confirmada</title>
  <style>
    body, table, td, a { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    img { border: 0; outline: none; text-decoration: none; display: block; }
    table { border-collapse: collapse !important; }
    body { margin: 0; padding: 0; background: ${b.bg}; color: ${b.text}; }
    a { color: ${b.accent}; text-decoration: none; }

    @media (prefers-color-scheme: dark) {
      body { background: #0B1220; color: #E5E7EB; }
      .card { background: #111827 !important; border-color: #1F2937 !important; }
      .muted { color: #9CA3AF !important; }
      .divider { border-color: #1F2937 !important; }
    }

    @media screen and (max-width: 640px) {
      .container { width: 100% !important; }
      .px { padding-left: 16px !important; padding-right: 16px !important; }
      .stack > * { display: block !important; width: 100% !important; }
      .logo img { margin: 0 auto !important; }
    }

    .shadow { box-shadow: 0 6px 24px rgba(2,6,23,0.08); }
    .rounded { border-radius: 14px; }
    .btn {
      background: linear-gradient(90deg, ${b.primary}, ${b.accent});
      color: #ffffff; font-weight: 700; padding: 12px 18px; border-radius: 10px; display: inline-block;
    }
    .muted { color: ${b.subtle}; }
    .divider { border-top: 1px solid ${b.border}; height: 1px; line-height:1px; }
    .chip { background: #F1F5F9; padding: 4px 8px; border-radius: 999px; font-size: 12px; color:${b.text}; }
  </style>
</head>
<body>
  <center style="width:100%; background:${b.bg}; padding:24px 0;">
    <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px; margin:0 auto;">
      <tr>
        <td class="px" style="padding: 0 24px;">
          <!-- Header -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr>
              <td class="logo" align="left" style="padding:8px 0;">
                <a href="${b.site}">
                  <img src="${b.logoUrl}" width="160" height="auto" alt="${b.name} Logo" style="max-width:200px;">
                </a>
              </td>
              <td align="right" style="font-size:12px; color:${b.subtle};">
                <span class="chip" style="border:1px solid ${b.border}">Confirmação de reserva</span>
              </td>
            </tr>
          </table>

          <!-- Card principal -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card shadow rounded" style="background:${b.card}; border:1px solid ${b.border};">
            <tr>
              <td style="padding:28px 24px 8px 24px;">
                <h1 style="margin:0 0 8px 0; font-size:22px; line-height:1.25; color:${b.text};">
                  Reserva confirmada 🎉
                </h1>
                <p style="margin:0; font-size:14px;" class="muted">
                  Olá, <strong style="color:${b.text}">${reserva.hospede_nome}</strong>! Obrigado por escolher a <strong>${b.name}</strong>.
                </p>
              </td>
            </tr>

            <!-- Detalhes -->
            <tr>
              <td style="padding:16px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="stack" style="vertical-align:top; padding:8px 0; width:50%;">
                      <p style="margin:0; font-size:12px;" class="muted">Flat</p>
                      <p style="margin:4px 0 0 0; font-weight:700; color:${b.text}">${reserva.flat_slug}</p>
                    </td>
                    <td class="stack" style="vertical-align:top; padding:8px 0; width:50%;">
                      <p style="margin:0; font-size:12px;" class="muted">Período</p>
                      <p style="margin:4px 0 0 0; font-weight:700; color:${b.text}">${reserva.checkin} &rarr; ${reserva.checkout}</p>
                    </td>
                  </tr>
                  <tr>
                    <td class="stack" style="vertical-align:top; padding:8px 0; width:50%;">
                      <p style="margin:0; font-size:12px;" class="muted">Horários</p>
                      <p style="margin:4px 0 0 0; color:${b.text}"><strong>Check-in:</strong> 14:00 &nbsp; • &nbsp; <strong>Check-out:</strong> 12:00</p>
                    </td>
                    <td class="stack" style="vertical-align:top; padding:8px 0; width:50%;">
                      <p style="margin:0; font-size:12px;" class="muted">Total</p>
                      <p style="margin:4px 0 0 0; font-weight:800; color:${b.text}">${total}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td style="padding:6px 24px 20px 24px;">
                <a href="${b.site}/minha-reserva/${reserva.id}" class="btn">Ver minha reserva</a>
                <div style="height:12px;"></div>
                <p class="muted" style="font-size:12px; margin:0;">
                  Para adicionar ao seu calendário, use o anexo <code>sucessoflats.ics</code>.
                </p>
              </td>
            </tr>

            <!-- Divider -->
            <tr><td style="padding:0 24px;"><div class="divider"></div></td></tr>

            <!-- Instruções -->
            <tr>
              <td style="padding:20px 24px;">
                <h3 style="margin:0 0 8px 0; font-size:16px; color:${b.text};">Instruções de check-in</h3>
                <ul style="margin:8px 0 0 18px; padding:0; color:${b.text};">
                  <li>Apresente documento com foto na chegada;</li>
                  <li>Silêncio após 22h.</li>
                </ul>
                <p class="muted" style="font-size:12px; margin:12px 0 0 0;">
                  Política: Cancelamento grátis até 48h antes.
                </p>
              </td>
            </tr>
          </table>

          <!-- Rodapé -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
            <tr>
              <td align="center" class="muted" style="font-size:12px; line-height:1.5;">
                <div style="margin:6px 0;">
                  <a href="${b.site}" style="color:${b.accent}; font-weight:700;">${b.name}</a> • ${b.address}
                </div>
                <div style="margin:6px 0;">
                  <a href="mailto:${b.supportEmail}" style="color:${b.accent};">${b.supportEmail}</a> • WhatsApp: ${b.whatsapp}
                </div>
                <div style="margin:6px 0;">© ${new Date().getFullYear()} ${b.name}. Todos os direitos reservados.</div>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </center>
</body>
</html>
`;
}
