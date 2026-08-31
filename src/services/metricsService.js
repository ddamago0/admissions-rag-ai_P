/**
 * In-memory Metrics and Session State Management Service
 */

const metrics = {
  totalQueries: 0,
  escalatedQueries: 0,
  totalLatencyMs: 0,
  startTime: new Date().toISOString(),
  estimatedTokens: {
    inputTokens: 0,
    outputTokens: 0
  },
  sessions: new Map(), // sessionId -> Array<{ role: string, content: string, timestamp: string }>
  escalationLog: [] // Recent escalation events
};

/**
 * Approximate token count from text (~4 chars per token)
 */
export function estimateTokens(text = '') {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Records a processed query and updates tracking metrics.
 */
export function recordQueryMetric({ sessionId, userQuery, reply, isEscalated, latencyMs, reason, leadInfo }) {
  metrics.totalQueries += 1;
  metrics.totalLatencyMs += latencyMs;

  const estimatedIn = estimateTokens(userQuery);
  const estimatedOut = estimateTokens(typeof reply === 'string' ? reply : JSON.stringify(reply));

  metrics.estimatedTokens.inputTokens += estimatedIn;
  metrics.estimatedTokens.outputTokens += estimatedOut;

  if (isEscalated) {
    metrics.escalatedQueries += 1;
    metrics.escalationLog.unshift({
      timestamp: new Date().toISOString(),
      sessionId: sessionId || 'anonymous',
      reason: reason || 'Human advisor requested',
      leadInfo: leadInfo || null
    });
    if (metrics.escalationLog.length > 50) {
      metrics.escalationLog.pop();
    }
  }

  // Update session history
  if (sessionId) {
    if (!metrics.sessions.has(sessionId)) {
      metrics.sessions.set(sessionId, []);
    }
    const sessionHistory = metrics.sessions.get(sessionId);
    sessionHistory.push({ role: 'user', content: userQuery, timestamp: new Date().toISOString() });
    sessionHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    
    // Retain only last 10 turns per session to manage memory
    if (sessionHistory.length > 20) {
      metrics.sessions.set(sessionId, sessionHistory.slice(-20));
    }
  }
}

/**
 * Retrieves session history for a given sessionId.
 */
export function getSessionHistory(sessionId) {
  if (!sessionId || !metrics.sessions.has(sessionId)) {
    return [];
  }
  return metrics.sessions.get(sessionId);
}

/**
 * Returns current metrics snapshot.
 */
export function getMetricsSnapshot() {
  const avgLatency = metrics.totalQueries > 0 
    ? Math.round(metrics.totalLatencyMs / metrics.totalQueries) 
    : 0;
  
  const escalationRate = metrics.totalQueries > 0
    ? parseFloat(((metrics.escalatedQueries / metrics.totalQueries) * 100).toFixed(2))
    : 0.0;

  // Gemini 1.5 Flash approx pricing: $0.075 / 1M input tokens, $0.30 / 1M output tokens
  const estimatedCostUSD = (
    (metrics.estimatedTokens.inputTokens / 1_000_000) * 0.075 +
    (metrics.estimatedTokens.outputTokens / 1_000_000) * 0.30
  ).toFixed(6);

  return {
    status: 'online',
    uptimeSeconds: Math.round((Date.now() - new Date(metrics.startTime).getTime()) / 1000),
    totalQueries: metrics.totalQueries,
    escalatedQueries: metrics.escalatedQueries,
    escalationRatePercent: escalationRate,
    averageLatencyMs: avgLatency,
    activeSessionsCount: metrics.sessions.size,
    tokenUsage: {
      estimatedInputTokens: metrics.estimatedTokens.inputTokens,
      estimatedOutputTokens: metrics.estimatedTokens.outputTokens,
      totalEstimatedTokens: metrics.estimatedTokens.inputTokens + metrics.estimatedTokens.outputTokens,
      estimatedCostUSD: `$${estimatedCostUSD}`
    },
    recentEscalations: metrics.escalationLog.slice(0, 10)
  };
}
