/**
 * Frontend Application Logic for Colombia Language Academy AI Assistant
 */

document.addEventListener('DOMContentLoaded', () => {
  // Session State
  let sessionId = sessionStorage.getItem('cla_session_id');
  if (!sessionId) {
    sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    sessionStorage.setItem('cla_session_id', sessionId);
  }

  // DOM Elements
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const userInput = document.getElementById('user-input');
  const btnSend = document.getElementById('btn-send');
  const charCounter = document.getElementById('char-counter');
  const chipsRow = document.getElementById('chips-row');
  const btnReindex = document.getElementById('btn-reindex');

  // Escalation Banner Elements
  const escalationBanner = document.getElementById('escalation-banner');
  const escalationTicketId = document.getElementById('escalation-ticket-id');
  const escalationReasonText = document.getElementById('escalation-reason-text');
  const closeEscalationBanner = document.getElementById('close-escalation-banner');

  // Metrics DOM Elements
  const metricTotalQueries = document.getElementById('metric-total-queries');
  const metricEscalationRate = document.getElementById('metric-escalation-rate');
  const metricAvgLatency = document.getElementById('metric-avg-latency');
  const metricEstTokens = document.getElementById('metric-est-tokens');
  const metricEstCost = document.getElementById('metric-est-cost');
  const recentTicketsList = document.getElementById('recent-tickets-list');

  let isSending = false;

  // Auto-resize textarea and update character count
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = `${Math.min(userInput.scrollHeight, 140)}px`;
    charCounter.textContent = `${userInput.value.length} / 1000`;
  });

  // Handle Enter key (without Shift) to submit
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSending && userInput.value.trim().length > 0) {
        chatForm.dispatchEvent(new Event('submit'));
      }
    }
  });

  // Suggestion chips click handler
  chipsRow.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip && !isSending) {
      const query = chip.getAttribute('data-query');
      if (query) {
        userInput.value = query;
        userInput.dispatchEvent(new Event('input'));
        chatForm.dispatchEvent(new Event('submit'));
      }
    }
  });

  // Close escalation banner
  closeEscalationBanner.addEventListener('click', () => {
    escalationBanner.classList.add('hidden');
  });

  // Simple Safe Markdown to HTML Formatter
  function renderMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold text **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Inline code `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bullet lists
    const lines = html.split('\n');
    let inList = false;
    const formattedLines = [];

    for (let line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (!inList) {
          formattedLines.push('<ul>');
          inList = true;
        }
        formattedLines.push(`<li>${trimmed.substring(2)}</li>`);
      } else {
        if (inList) {
          formattedLines.push('</ul>');
          inList = false;
        }
        if (trimmed.length > 0) {
          formattedLines.push(`<p>${line}</p>`);
        }
      }
    }
    if (inList) {
      formattedLines.push('</ul>');
    }

    return formattedLines.join('');
  }

  // Append a user or assistant message to chat
  function appendMessage({ role, text, sources = [], suggestedActions = [], ticketId = null, isEscalated = false }) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.innerHTML = role === 'user' ? '👤' : '🇨🇴';

    const body = document.createElement('div');
    body.className = 'msg-body';
    body.innerHTML = renderMarkdown(text);

    // If sources exist, append tags
    if (sources && sources.length > 0) {
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.innerHTML = `<span>Grounded via RAG:</span> ${sources.map(s => `<span class="source-tag">${s}</span>`).join(' ')}`;
      body.appendChild(meta);
    }

    // If suggested next actions exist, append clickable chips
    if (suggestedActions && suggestedActions.length > 0) {
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'action-chips';
      for (const action of suggestedActions) {
        const btn = document.createElement('button');
        btn.className = 'action-chip';
        btn.textContent = action;
        btn.addEventListener('click', () => {
          if (!isSending) {
            userInput.value = action;
            userInput.dispatchEvent(new Event('input'));
            chatForm.dispatchEvent(new Event('submit'));
          }
        });
        actionsContainer.appendChild(btn);
      }
      body.appendChild(actionsContainer);
    }

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(body);
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Show escalation banner if applicable
    if (isEscalated) {
      escalationTicketId.textContent = ticketId || 'ESC-PENDING';
      escalationReasonText.textContent = 'Our Admissions & Support Department has received your priority escalation ticket.';
      escalationBanner.classList.remove('hidden');
    }
  }

  // Create typing indicator
  function showTypingIndicator() {
    const indicatorDiv = document.createElement('div');
    indicatorDiv.id = 'typing-indicator';
    indicatorDiv.className = 'message assistant';
    indicatorDiv.innerHTML = `
      <div class="msg-avatar">🇨🇴</div>
      <div class="msg-body">
        <div class="typing-bubble">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
    chatMessages.appendChild(indicatorDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return indicatorDiv;
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
  }

  // Handle Chat Form Submit
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = userInput.value.trim();
    if (!query || isSending) return;

    isSending = true;
    btnSend.disabled = true;

    // Add user message to UI
    appendMessage({ role: 'user', text: query });

    // Clear input
    userInput.value = '';
    userInput.style.height = 'auto';
    charCounter.textContent = '0 / 1000';

    // Show typing animation
    showTypingIndicator();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, sessionId })
      });

      removeTypingIndicator();

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${response.status}`);
      }

      const data = await response.json();

      appendMessage({
        role: 'assistant',
        text: data.reply || 'No response returned.',
        sources: data.sources || [],
        suggestedActions: data.suggested_actions || [],
        ticketId: data.ticketId,
        isEscalated: data.escalate
      });

      // Refresh metrics immediately
      fetchMetrics();
    } catch (error) {
      removeTypingIndicator();
      appendMessage({
        role: 'assistant',
        text: `⚠️ **Error:** ${error.message}. Please verify that your \`GEMINI_API_KEY\` is configured in \`.env\` and the server is running.`
      });
    } finally {
      isSending = false;
      btnSend.disabled = false;
      userInput.focus();
    }
  });

  // Fetch Live Operational Metrics
  async function fetchMetrics() {
    try {
      const res = await fetch('/api/metrics');
      if (!res.ok) return;
      const json = await res.json();
      const m = json.data;

      if (metricTotalQueries) metricTotalQueries.textContent = m.totalQueries;
      if (metricEscalationRate) metricEscalationRate.textContent = `${m.escalationRatePercent}%`;
      if (metricAvgLatency) metricAvgLatency.textContent = `${m.averageLatencyMs} ms`;
      if (metricEstTokens) metricEstTokens.textContent = m.tokenUsage.totalEstimatedTokens.toLocaleString();
      if (metricEstCost) metricEstCost.textContent = m.tokenUsage.estimatedCostUSD;

      // Update recent tickets feed
      if (recentTicketsList && m.recentEscalations) {
        if (m.recentEscalations.length === 0) {
          recentTicketsList.innerHTML = '<div class="no-tickets">No active escalations recorded.</div>';
        } else {
          recentTicketsList.innerHTML = m.recentEscalations.map(t => `
            <div class="ticket-item">
              <div class="ticket-item-header">
                <span>${t.reason.substring(0, 24)}...</span>
                <span>${new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div class="ticket-item-reason">${t.leadInfo?.phone || t.leadInfo?.name || t.sessionId}</div>
            </div>
          `).join('');
        }
      }
    } catch (e) {
      // Background poll failure silent handling
    }
  }

  // Re-index button handler
  btnReindex.addEventListener('click', async () => {
    if (!confirm('Re-index knowledge base documents into vector store?')) return;
    
    btnReindex.disabled = true;
    btnReindex.innerHTML = '<span>Indexing...</span>';

    try {
      const res = await fetch('/api/ingest', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert('Knowledge base re-indexed successfully!');
      } else {
        alert(`Ingestion failed: ${data.error || 'Unknown error'}`);
      }
    } catch (e) {
      alert(`Network error triggering re-ingestion: ${e.message}`);
    } finally {
      btnReindex.disabled = false;
      btnReindex.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        <span>Re-index Docs</span>
      `;
      fetchMetrics();
    }
  });

  // Initial metrics fetch and recurring interval (every 10 seconds)
  fetchMetrics();
  setInterval(fetchMetrics, 10000);
});
