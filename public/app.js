/**
 * Frontend Interactive Controller for Colombia Language Academy Homepage & Floating AI Chat Widget.
 */

// Session state
let currentSessionId = localStorage.getItem('cla_session_id') || `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
localStorage.setItem('cla_session_id', currentSessionId);

let isWaitingForResponse = false;
let isChatOpen = false;
let speechRecognition = null;
let isRecordingVoice = false;

// DOM Elements
const chatLauncher = document.getElementById('chat-widget-launcher');
const chatDrawer = document.getElementById('chat-widget-drawer');
const btnMinimizeChat = document.getElementById('btn-minimize-chat');
const btnHeaderChat = document.getElementById('btn-header-chat');
const btnHeroChat = document.getElementById('btn-hero-chat');
const btnMobileMenu = document.getElementById('btn-mobile-menu');
const mobileMenuDrawer = document.getElementById('mobile-menu-drawer');

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const btnSend = document.getElementById('btn-send');
const btnVoiceInput = document.getElementById('btn-voice-input');
const charCounter = document.getElementById('char-counter');
const chipsRow = document.getElementById('chips-row');

// Escalation Banner Elements
const escalationBanner = document.getElementById('escalation-banner');
const escalationTicketId = document.getElementById('escalation-ticket-id');
const escalationReasonText = document.getElementById('escalation-reason-text');
const closeEscalationBanner = document.getElementById('close-escalation-banner');

// Theme Management (Dark Mode Default vs Light Mode)
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const themeIconSun = document.getElementById('theme-icon-sun');
const themeIconMoon = document.getElementById('theme-icon-moon');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('cla_theme', theme);
  if (theme === 'light') {
    if (themeIconSun) themeIconSun.classList.add('hidden');
    if (themeIconMoon) themeIconMoon.classList.remove('hidden');
  } else {
    if (themeIconSun) themeIconSun.classList.remove('hidden');
    if (themeIconMoon) themeIconMoon.classList.add('hidden');
  }
}

const savedTheme = localStorage.getItem('cla_theme') || 'dark';
applyTheme(savedTheme);

if (btnThemeToggle) {
  btnThemeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
  });
}

// ============================================================================
// NAVIGATION & CHAT LAUNCHER CONTROLS
// ============================================================================

if (btnMobileMenu && mobileMenuDrawer) {
  btnMobileMenu.addEventListener('click', () => {
    mobileMenuDrawer.classList.toggle('hidden');
  });

  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenuDrawer.classList.add('hidden');
    });
  });
}

function openChat() {
  isChatOpen = true;
  chatDrawer.classList.remove('hidden');
  chatLauncher.classList.add('hidden');
  if (mobileMenuDrawer) mobileMenuDrawer.classList.add('hidden');
  userInput.focus();
  scrollToBottom();
}

function closeChat() {
  isChatOpen = false;
  chatDrawer.classList.add('hidden');
  chatLauncher.classList.remove('hidden');
}

chatLauncher.addEventListener('click', openChat);
btnMinimizeChat.addEventListener('click', closeChat);
if (btnHeaderChat) btnHeaderChat.addEventListener('click', openChat);
if (btnHeroChat) btnHeroChat.addEventListener('click', openChat);

// Card Inquire Buttons
document.querySelectorAll('.btn-card-inquire').forEach(btn => {
  btn.addEventListener('click', () => {
    const query = btn.getAttribute('data-query');
    openChat();
    if (query) {
      userInput.value = query;
      handleSendMessage(query);
    }
  });
});

// Hero Quick Prompt Pills
document.querySelectorAll('.prompt-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    const query = btn.getAttribute('data-query');
    openChat();
    if (query) {
      userInput.value = query;
      handleSendMessage(query);
    }
  });
});

// Auto-resize Textarea & Char Counter
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = `${Math.min(userInput.scrollHeight, 100)}px`;
  charCounter.textContent = `${userInput.value.length} / 1000`;
});

// Submit on Enter (Shift+Enter for newline)
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

// Close Escalation Banner
if (closeEscalationBanner) {
  closeEscalationBanner.addEventListener('click', () => {
    escalationBanner.classList.add('hidden');
  });
}

// Suggestion Chips
chipsRow.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip && !isWaitingForResponse) {
    const query = chip.getAttribute('data-query') || chip.textContent;
    handleSendMessage(query);
  }
});

// ============================================================================
// VOICE INPUT / SPEECH RECOGNITION (WEB SPEECH API)
// ============================================================================

if (btnVoiceInput) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = false;
    speechRecognition.lang = 'es-CO';

    speechRecognition.onstart = () => {
      isRecordingVoice = true;
      btnVoiceInput.classList.add('recording');
      btnVoiceInput.title = 'Escuchando... habla ahora';
    };

    speechRecognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      userInput.value = transcript;
      userInput.dispatchEvent(new Event('input'));
    };

    speechRecognition.onerror = () => {
      isRecordingVoice = false;
      btnVoiceInput.classList.remove('recording');
    };

    speechRecognition.onend = () => {
      isRecordingVoice = false;
      btnVoiceInput.classList.remove('recording');
      btnVoiceInput.title = 'Dictar mensaje por voz';
    };

    btnVoiceInput.addEventListener('click', () => {
      if (isRecordingVoice) {
        speechRecognition.stop();
      } else {
        speechRecognition.start();
      }
    });
  } else {
    btnVoiceInput.style.display = 'none'; // Hide if browser lacks support
  }
}

// ============================================================================
// MARKDOWN RENDERING & HELPERS
// ============================================================================

function renderMarkdown(text) {
  if (!text || typeof text !== 'string') return '';
  
  let formatted = text
    .replace(/^### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^## (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  // Convert list items
  formatted = formatted.replace(/(?:<br\/>|\A)\* (.*?)(?=(?:<br\/>|\Z))/g, '<li>$1</li>');
  if (formatted.includes('<li>')) {
    formatted = formatted.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');
  }

  return `<p>${formatted}</p>`;
}

function scrollToBottom() {
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 50);
}

function formatTelemetryLabel(tier, modelUsed, latencyMs) {
  if (tier === 'TIER_0_LOCAL_GUARDRAIL') {
    return { class: 'guardrail', text: `⚡ ${latencyMs}ms • Guardrail Local ($0 tokens)` };
  }
  if (tier === 'TIER_0_CACHE' || latencyMs <= 5) {
    return { class: 'fast-cache', text: `⚡ ${latencyMs}ms • Caché RAM Sub-milisegundo` };
  }
  if (tier === 'TIER_4_EXTERNAL_GROQ') {
    return { class: 'llm-gateway', text: `⚡ ${latencyMs}ms • Groq ${modelUsed}` };
  }
  return { class: 'llm-gateway', text: `⚡ ${latencyMs}ms • ${modelUsed || 'Gemini 3.5 Flash Lite'}` };
}

// ============================================================================
// MESSAGE CREATION & RENDERING
// ============================================================================

function appendMessage(role, text, metadata = {}) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;

  const avatarDiv = document.createElement('div');
  avatarDiv.className = 'msg-avatar';
  avatarDiv.textContent = role === 'user' ? '👤' : '🇨🇴';

  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'msg-body';
  bodyDiv.innerHTML = role === 'user' ? `<p>${text.replace(/\n/g, '<br/>')}</p>` : renderMarkdown(text);

  // Assistant Telemetry & Grounding Pill
  if (role === 'assistant') {
    const latency = metadata.latencyMs || 2;
    const tier = metadata.tier || (latency <= 5 ? 'TIER_0_CACHE' : 'TIER_1_PRIMARY');
    const tele = formatTelemetryLabel(tier, metadata.modelUsed, latency);
    const metaRow = document.createElement('div');
    metaRow.className = 'msg-meta-row';
    metaRow.style.display = 'flex';
    metaRow.style.flexWrap = 'wrap';
    metaRow.style.alignItems = 'center';
    metaRow.style.gap = '6px';
    metaRow.style.marginTop = '8px';

    const pillDiv = document.createElement('div');
    pillDiv.className = `telemetry-pill ${tele.class}`;
    pillDiv.innerHTML = tele.text;
    metaRow.appendChild(pillDiv);

    // Copy message button
    const btnCopy = document.createElement('button');
    btnCopy.className = 'btn-msg-copy';
    btnCopy.innerHTML = '📋 Copiar';
    btnCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(text);
      btnCopy.innerHTML = '✓ Copiado';
      setTimeout(() => { btnCopy.innerHTML = '📋 Copiar'; }, 2000);
    });
    metaRow.appendChild(btnCopy);
    bodyDiv.appendChild(metaRow);
  }

  // Dynamic Suggested Action Buttons
  if (role === 'assistant' && Array.isArray(metadata.suggested_actions) && metadata.suggested_actions.length > 0) {
    const suggestionsRow = document.createElement('div');
    suggestionsRow.className = 'chips-row';
    suggestionsRow.style.marginTop = '10px';
    
    metadata.suggested_actions.forEach(actionText => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.textContent = actionText;
      btn.addEventListener('click', () => {
        if (!isWaitingForResponse) {
          handleSendMessage(actionText);
        }
      });
      suggestionsRow.appendChild(btn);
    });
    bodyDiv.appendChild(suggestionsRow);
  }

  msgDiv.appendChild(avatarDiv);
  msgDiv.appendChild(bodyDiv);
  chatMessages.appendChild(msgDiv);
  scrollToBottom();
}

function appendTypingIndicator() {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message assistant typing-msg';
  typingDiv.id = 'typing-indicator';
  typingDiv.innerHTML = `
    <div class="msg-avatar">🇨🇴</div>
    <div class="msg-body" style="color: var(--text-muted); font-style: italic;">
      Consultando el catálogo institucional...
    </div>
  `;
  chatMessages.appendChild(typingDiv);
  scrollToBottom();
}

function removeTypingIndicator() {
  const typingDiv = document.getElementById('typing-indicator');
  if (typingDiv) typingDiv.remove();
}

// ============================================================================
// SEND MESSAGE FLOW
// ============================================================================

async function handleSendMessage(messageText) {
  const cleanMsg = typeof messageText === 'string' ? messageText.trim() : userInput.value.trim();
  if (!cleanMsg || isWaitingForResponse) return;

  // Clear input
  userInput.value = '';
  userInput.style.height = 'auto';
  charCounter.textContent = '0 / 1000';

  // 1. Add User Message
  appendMessage('user', cleanMsg);

  // 2. Set State
  isWaitingForResponse = true;
  btnSend.disabled = true;
  appendTypingIndicator();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: cleanMsg,
        sessionId: currentSessionId
      })
    });

    const data = await response.json();
    removeTypingIndicator();

    if (response.ok && data.success) {
      // Handle Escalation Banner
      if (data.escalate) {
        escalationTicketId.textContent = data.ticketId || 'ESC-PRIORITARIO';
        escalationReasonText.textContent = 'Hemos registrado tus datos exitosamente. Nuestro asesor académico se pondrá en contacto directo contigo a la mayor brevedad.';
        escalationBanner.classList.remove('hidden');
      }

      // Add Assistant Message with rich telemetry
      appendMessage('assistant', data.reply, {
        sources: data.sources || [],
        suggested_actions: data.suggested_actions || [],
        latencyMs: data.latencyMs,
        tier: data.tier,
        modelUsed: data.modelUsed
      });
    } else {
      appendMessage('assistant', `⚠️ ${data.error || 'No fue posible procesar tu solicitud. Por favor intenta de nuevo.'}`);
    }
  } catch (err) {
    removeTypingIndicator();
    appendMessage('assistant', '⚠️ Error de conexión con el servidor. Por favor verifica tu red.');
  } finally {
    isWaitingForResponse = false;
    btnSend.disabled = false;
    userInput.focus();
  }
}

// Form Submit Event
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSendMessage();
});
