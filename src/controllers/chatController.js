import { processCustomerInquiry } from '../services/aiService.js';
import { runIngestion } from '../rag/ingest.js';
import { recordQueryMetric, getSessionHistory, getMetricsSnapshot } from '../services/metricsService.js';
import { sendAdvisorEmailAlert } from '../services/emailService.js';
import { config } from '../config/env.js';

/**
 * Dispatches a stylized push notification with an interactive 1-click reply button to Telegram.
 */
async function sendDirectTelegramAlert({ ticketId, reason, leadInfo, inquiry, reply }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  // Extract Full Name and First Name
  const fullName = leadInfo?.name || 'Estudiante / Prospecto';
  const firstName = leadInfo?.first_name || fullName.trim().split(/\s+/)[0] || 'Estudiante';
  
  const leadPhone = leadInfo?.phone || process.env.ADVISOR_PHONE || '3014777763';
  const leadEmail = leadInfo?.email || 'No especificado';
  const cleanPhone = leadPhone.replace(/[^0-9]/g, '');
  const fullPhone = cleanPhone.startsWith('57') ? cleanPhone : ('57' + cleanPhone);

  const naturalTopic = leadInfo?.topic || reason || 'tu consulta académica';

  // Natural 1-click reply message template
  const defaultReplyMsg = encodeURIComponent(
    `Hola ${firstName}, he recibido la solicitud de tu caso [Ticket ${ticketId}] respecto a: ${naturalTopic}. Me pongo en contacto contigo para ayudarte a resolverlo.`
  );
  const waReplyUrl = `https://wa.me/${fullPhone}?text=${defaultReplyMsg}`;

  const formattedCard = [
    '🏛️ *COLOMBIA LANGUAGE ACADEMY*',
    '🚨 *NUEVA SOLICITUD DE ATENCIÓN PRIORITARIA*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━',
    `🎫 *Ticket ID:* \`${ticketId}\``,
    `⚡ *Prioridad:* 🔥 ALTA`,
    `👤 *Nombre Completo:* ${fullName}`,
    `📱 *Teléfono / Telegram:* \`+${fullPhone}\``,
    `📧 *Correo Electrónico:* \`${leadEmail}\``,
    `📌 *Inquietud / Asunto:*`,
    `👉 _${naturalTopic}_`,
    '',
    `💬 *Mensaje Original del Usuario:*`,
    `"${inquiry || ''}"`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━',
    `👉 *Acción:* Toca el botón para abrir chat con *${firstName}*:`
  ].join('\n');

  const payload = {
    chat_id: chatId,
    text: formattedCard,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `💬 Responder a ${firstName}`,
            url: waReplyUrl
          }
        ]
      ]
    }
  };

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      console.log(`[Telegram Alert] Interactive alert successfully delivered to chat ${chatId}`);
    } else {
      const errText = await res.text();
      console.warn(`[Telegram Alert] Telegram API error: ${errText}`);
    }
  } catch (err) {
    console.warn(`[Telegram Alert] Network error: ${err.message}`);
  }
}

/**
 * Helper to dispatch escalation event to Python automation orchestrator webhook.
 */
async function dispatchPythonEscalation(payload) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout

    const response = await fetch(config.automation.orchestratorUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return data?.ticket?.ticket_id || data?.ticket_id || null;
    }
  } catch (err) {
    console.warn(`[Escalation Dispatch] Python orchestrator offline or unreachable at ${config.automation.orchestratorUrl} (${err.message}).`);
  }
  return null;
}

/**
 * POST /api/chat
 * Handles incoming customer inquiries with RAG and Gemini.
 */
export async function handleChat(req, res, next) {
  const startTime = Date.now();
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'The "message" field is required and must be a non-empty string.'
      });
    }

    const currentSessionId = sessionId || `sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const history = getSessionHistory(currentSessionId);

    // Process inquiry through RAG + Gemini
    const aiResult = await processCustomerInquiry(message.trim(), history);
    const latencyMs = Date.now() - startTime;

    let ticketId = null;

    // If escalation required, generate Ticket ID and dispatch multi-channel alerts
    if (aiResult.escalate) {
      const generatedTicketId = `ESC-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      // 1. Send stylized interactive Telegram alert with 1-click reply button
      sendDirectTelegramAlert({
        ticketId: generatedTicketId,
        reason: aiResult.reason,
        leadInfo: aiResult.lead_info,
        inquiry: message,
        reply: aiResult.reply
      }).catch(e => console.warn('Telegram direct dispatch error:', e.message));

      // 2. Send email notification to advisor
      sendAdvisorEmailAlert({
        ticketId: generatedTicketId,
        reason: aiResult.reason,
        leadInfo: aiResult.lead_info,
        inquiry: message,
        reply: aiResult.reply
      }).catch(e => console.warn('Email dispatch error:', e.message));

      // 3. Forward to Python automation orchestrator
      const pythonTicketId = await dispatchPythonEscalation({
        ticket_id: generatedTicketId,
        reason: aiResult.reason,
        lead_info: aiResult.lead_info,
        inquiry: message,
        reply: aiResult.reply,
        sources: aiResult.sources || []
      });

      ticketId = pythonTicketId || generatedTicketId;
    }

    // Record metrics & update session history
    recordQueryMetric({
      sessionId: currentSessionId,
      userQuery: message.trim(),
      reply: aiResult.reply,
      isEscalated: !!aiResult.escalate,
      latencyMs,
      reason: aiResult.reason,
      leadInfo: aiResult.lead_info
    });

    return res.status(200).json({
      success: true,
      sessionId: currentSessionId,
      escalate: !!aiResult.escalate,
      ticketId: ticketId || (aiResult.escalate ? `ESC-${Date.now().toString().slice(-6)}` : null),
      reason: aiResult.reason || null,
      reply: aiResult.reply || 'No response returned.',
      lead_info: aiResult.lead_info || null,
      suggested_actions: aiResult.suggested_actions || [],
      sources: aiResult.sources || [],
      latencyMs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chat error details:', error);
    next(error);
  }
}

/**
 * GET /api/metrics
 * Returns real-time metrics and system analytics.
 */
export function handleGetMetrics(req, res) {
  const snapshot = getMetricsSnapshot();
  return res.status(200).json({
    success: true,
    data: snapshot
  });
}

/**
 * POST /api/ingest
 * Triggers re-indexing of the RAG knowledge base.
 */
export async function handleIngest(req, res, next) {
  try {
    await runIngestion();
    return res.status(200).json({
      success: true,
      message: 'Knowledge base documents re-indexed successfully into vector store.'
    });
  } catch (error) {
    console.error('Ingest error details:', error);
    next(error);
  }
}
