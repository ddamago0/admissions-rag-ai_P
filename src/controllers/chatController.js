import { processCustomerInquiry } from '../services/aiService.js';
import { runIngestion } from '../rag/ingest.js';
import { recordQueryMetric, getSessionHistory, getMetricsSnapshot } from '../services/metricsService.js';
import { config } from '../config/env.js';

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
    console.warn(`[Escalation Dispatch] Python orchestrator offline or unreachable at ${config.automation.orchestratorUrl} (${err.message}). Logged locally.`);
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

    // If escalation required, forward to Python automation orchestrator
    if (aiResult.escalate) {
      ticketId = await dispatchPythonEscalation({
        reason: aiResult.reason,
        lead_info: aiResult.lead_info,
        inquiry: message,
        reply: aiResult.reply,
        sources: aiResult.sources || []
      });
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
      reply: aiResult.reply,
      lead_info: aiResult.lead_info || null,
      suggested_actions: aiResult.suggested_actions || [],
      sources: aiResult.sources || [],
      latencyMs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
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
    next(error);
  }
}
