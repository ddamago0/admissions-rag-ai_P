/**
 * Frontend Interactive Controller for Colombia Language Academy Homepage & Floating AI Chat Widget.
 */

// State
let currentSessionId = localStorage.getItem('cla_session_id') || `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
localStorage.setItem('cla_session_id', currentSessionId);

let isWaitingForResponse = false;
let isChatOpen = false;

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
const charCounter = document.getElementById('char-counter');
const chipsRow = document.getElementById('chips-row');

// Escalation Banner Elements
const escalationBanner = document.getElementById('escalation-banner');
const escalationTicketId = document.getElementById('escalation-ticket-id');
const escalationReasonText = document.getElementById('escalation-reason-text');
const closeEscalationBanner = document.getElementById('close-escalation-banner');

// Mobile Hamburger Menu Toggle
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

// Toggle Floating Chat Drawer
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
closeEscalationBanner.addEventListener('click', () => {
  escalationBanner.classList.add('hidden');
});

// Suggestion Chips
chipsRow.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip && !isWaitingForResponse) {
    const query = chip.getAttribute('data-query') || chip.textContent;
    handleSendMessage(query);
  }
});

// Format Markdown
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

// Scroll Messages to Bottom
function scrollToBottom() {
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 50);
}

// Append Message to UI
function appendMessage(role, text, metadata = {}) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;

  const avatarDiv = document.createElement('div');
  avatarDiv.className = 'msg-avatar';
  avatarDiv.textContent = role === 'user' ? '👤' : '🇨🇴';

  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'msg-body';
  bodyDiv.innerHTML = role === 'user' ? `<p>${text.replace(/\n/g, '<br/>')}</p>` : renderMarkdown(text);

  // Grounded Sources
  if (role === 'assistant' && metadata.sources && metadata.sources.length > 0) {
    const sourcesDiv = document.createElement('div');
    sourcesDiv.className = 'sources-row';
    sourcesDiv.innerHTML = `<span>Grounded via RAG:</span> ${metadata.sources.map(s => `<span class="source-tag">${s}</span>`).join(' ')}`;
    bodyDiv.appendChild(sourcesDiv);
  }

  // Dynamic Suggested Action Buttons
  if (role === 'assistant' && Array.isArray(metadata.suggested_actions) && metadata.suggested_actions.length > 0) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'suggestions-row';
    metadata.suggested_actions.forEach(actionText => {
      const btn = document.createElement('button');
      btn.className = 'action-chip';
      btn.textContent = actionText;
      btn.addEventListener('click', () => {
        if (!isWaitingForResponse) {
          handleSendMessage(actionText);
        }
      });
      actionsDiv.appendChild(btn);
    });
    bodyDiv.appendChild(actionsDiv);
  }

  msgDiv.appendChild(avatarDiv);
  msgDiv.appendChild(bodyDiv);
  chatMessages.appendChild(msgDiv);
  scrollToBottom();
}

// Append Typing Loader
function appendTypingIndicator() {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message assistant typing-msg';
  typingDiv.id = 'typing-indicator';
  typingDiv.innerHTML = `
    <div class="msg-avatar">🇨🇴</div>
    <div class="msg-body" style="color: var(--text-muted); font-style: italic;">
      Consulting academy knowledge base...
    </div>
  `;
  chatMessages.appendChild(typingDiv);
  scrollToBottom();
}

function removeTypingIndicator() {
  const typingDiv = document.getElementById('typing-indicator');
  if (typingDiv) typingDiv.remove();
}

// Send Message Handler
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
        escalationTicketId.textContent = data.ticketId || 'ESC-PRIORITY';
        escalationReasonText.textContent = 'Hemos registrado tus datos exitosamente. Nuestro asesor académico se pondrá en contacto directo contigo a la mayor brevedad.';
        escalationBanner.classList.remove('hidden');
      }

      // Add Assistant Message
      appendMessage('assistant', data.reply, {
        sources: data.sources || [],
        suggested_actions: data.suggested_actions || []
      });
    } else {
      appendMessage('assistant', `⚠️ ${data.error || 'Unable to connect to admissions service. Please try again.'}`);
    }
  } catch (err) {
    removeTypingIndicator();
    appendMessage('assistant', '⚠️ Network connection error. Please verify your connection or contact our hotline directly.');
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
