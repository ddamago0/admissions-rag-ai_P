import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

let transporter = null;

function createTransporter(targetPort = 465) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const isSecure = targetPort === 465;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: targetPort,
    secure: isSecure,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000
  });
}

/**
 * Sends a stylized HTML email alert to the advisor's email address.
 * Automatically attempts Port 465 (SMTPS) first (optimal for cloud hosts like Render),
 * and falls back to Port 587 if needed.
 */
export async function sendAdvisorEmailAlert({ ticketId, reason, leadInfo, inquiry, reply }) {
  const targetEmail = process.env.ADVISOR_EMAIL || 'ddamago0@gmail.com';
  const senderUser = process.env.SMTP_USER;
  const senderPass = process.env.SMTP_PASS;

  if (!senderUser || !senderPass) {
    console.log(`[Email Dispatcher] SMTP credentials not configured. To receive email alerts at ${targetEmail}, add SMTP_USER and SMTP_PASS in environment.`);
    return false;
  }

  const leadName = leadInfo?.name || 'Student / Prospect';
  const leadPhone = leadInfo?.phone || 'N/A';
  const leadEmail = leadInfo?.email || 'N/A';
  const cleanPhone = leadPhone.replace(/[^0-9]/g, '');
  const fullPhone = cleanPhone.startsWith('57') ? cleanPhone : ('57' + cleanPhone);
  const waReplyLink = `https://wa.me/${fullPhone}?text=${encodeURIComponent(`Hola ${leadName}! Te comunicas con Daniel de Academia de Idiomas Colombia para atender tu solicitud [Ticket ${ticketId}]: ${reason}`)}`;

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; margin: 0; padding: 25px; color: #1e293b; }
      .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
      .header { background: linear-gradient(135deg, #059669, #047857); padding: 20px 25px; color: #ffffff; }
      .header h1 { margin: 0; font-size: 18px; letter-spacing: -0.02em; }
      .header p { margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; }
      .content { padding: 25px; }
      .badge { display: inline-block; background: #fee2e2; color: #dc2626; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-bottom: 15px; }
      .details-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
      .details-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
      .details-table td.label { font-weight: 600; color: #64748b; width: 130px; }
      .details-table td.value { color: #0f172a; font-weight: 500; }
      .inquiry-box { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 12px 15px; border-radius: 4px; font-style: italic; margin-bottom: 20px; font-size: 13px; color: #334155; }
      .btn { display: inline-block; background: #059669; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; }
      .footer { padding: 15px 25px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Colombia Language Academy</h1>
        <p>Intelligent Admissions & Academic Escalation Alert</p>
      </div>
      <div class="content">
        <div class="badge">🔥 PRIORIDAD ALTA</div>
        <table class="details-table">
          <tr><td class="label">Ticket ID:</td><td class="value"><strong>${ticketId}</strong></td></tr>
          <tr><td class="label">Estudiante:</td><td class="value">${leadName}</td></tr>
          <tr><td class="label">Teléfono / Telegram:</td><td class="value">+${fullPhone}</td></tr>
          <tr><td class="label">Correo:</td><td class="value">${leadEmail}</td></tr>
          <tr><td class="label">Motivo:</td><td class="value">${reason}</td></tr>
          <tr><td class="label">Fecha / Hora:</td><td class="value">${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td></tr>
        </table>
        <div class="inquiry-box">
          "${inquiry}"
        </div>
        <div style="text-align: center; margin: 25px 0 10px 0;">
          <a href="${waReplyLink}" class="btn">💬 Responder al Estudiante por WhatsApp</a>
        </div>
      </div>
      <div class="footer">
        Asignado a: Daniel (${targetEmail}) | Colombia Language Academy &copy; 2026
      </div>
    </div>
  </body>
  </html>
  `;

  const primaryPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const secondaryPort = primaryPort === 465 ? 587 : 465;

  const mailOptions = {
    from: `"Colombia Language Academy" <${senderUser}>`,
    to: targetEmail,
    subject: `🚨 [Ticket ${ticketId}] Nueva Solicitud de Atención: ${leadName}`,
    html: htmlContent
  };

  try {
    const primaryClient = createTransporter(primaryPort);
    const info = await primaryClient.sendMail(mailOptions);
    console.log(`[Email Dispatcher] Alert successfully sent to ${targetEmail} via port ${primaryPort}: ${info.messageId}`);
    return true;
  } catch (errPrimary) {
    console.warn(`[Email Dispatcher] Port ${primaryPort} dispatch failed (${errPrimary.message}). Retrying via port ${secondaryPort}...`);
    try {
      const secondaryClient = createTransporter(secondaryPort);
      const fallbackInfo = await secondaryClient.sendMail(mailOptions);
      console.log(`[Email Dispatcher] Alert successfully sent to ${targetEmail} via fallback port ${secondaryPort}: ${fallbackInfo.messageId}`);
      return true;
    } catch (errSecondary) {
      console.warn(`[Email Dispatcher] Fallback port ${secondaryPort} also failed (${errSecondary.message}). Check SMTP host policy.`);
      return false;
    }
  }
}
