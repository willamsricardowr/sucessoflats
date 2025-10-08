// api/_lib/email.js
export async function sendMail({ to, subject, text, html, attachments = [] }) {
  // --- Caminho 1: RESEND (recomendado) ---
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        text,
        html,
        attachments    // [{ filename, content(base64), type, disposition }]
      })
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`Resend falhou: ${t}`);
    }
    return await resp.json();
  }

  // --- Caminho 2: SMTP (fallback com nodemailer) ---
  // Requer: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
  if (
    process.env.SMTP_HOST && process.env.SMTP_PORT &&
    process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM
  ) {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true', // true=465
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: Array.isArray(to) ? to.join(',') : to,
      subject,
      text,
      html,
      attachments: (attachments || []).map(a => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'base64'),
        contentType: a.type || 'application/octet-stream',
        encoding: 'base64',
        disposition: a.disposition || 'attachment'
      }))
    };

    const info = await transporter.sendMail(mailOptions);
    return { ok: true, messageId: info.messageId };
  }

  throw new Error('Nenhum provedor de e-mail configurado. Defina RESEND_* ou SMTP_* no backend.');
}
