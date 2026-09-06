/**
 * Administrator Portal JavaScript Client
 * Manages authentication, document CRUD operations, dynamic vector re-indexing, and escalation tickets.
 */

const API_BASE = '/api';
let adminToken = sessionStorage.getItem('cla_admin_token') || null;
let currentDeletingFilename = null;
let isEditMode = false;

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const dashboardApp = document.getElementById('dashboard-app');
const loginForm = document.getElementById('admin-login-form');
const authErrorMsg = document.getElementById('auth-error-msg');
const btnLogout = document.getElementById('btn-logout');
const toastBanner = document.getElementById('toast-banner');

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

const docsTableBody = document.getElementById('docs-table-body');
const ticketsTableBody = document.getElementById('tickets-table-body');

const statDocsCount = document.getElementById('stat-docs-count');
const statTicketsCount = document.getElementById('stat-tickets-count');
const statQueriesCount = document.getElementById('stat-queries-count');
const statCostVal = document.getElementById('stat-cost-val');

// Modals
const docModal = document.getElementById('doc-modal');
const docForm = document.getElementById('doc-form');
const docFilenameInput = document.getElementById('doc-filename');
const docContentInput = document.getElementById('doc-content');
const modalTitle = document.getElementById('modal-title');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelDoc = document.getElementById('btn-cancel-doc');
const btnOpenCreate = document.getElementById('btn-open-create');

const uploadModal = document.getElementById('upload-modal');
const btnOpenUpload = document.getElementById('btn-open-upload');
const btnCloseUpload = document.getElementById('btn-close-upload');
const btnCancelUpload = document.getElementById('btn-cancel-upload');
const fileInput = document.getElementById('file-input');
const selectedFilenameSpan = document.getElementById('selected-filename');
const btnConfirmUpload = document.getElementById('btn-confirm-upload');
const uploadForm = document.getElementById('upload-form');

const deleteModal = document.getElementById('delete-modal');
const btnCloseDelete = document.getElementById('btn-close-delete');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const deleteFilenameLabel = document.getElementById('delete-filename-label');

const btnReindexAll = document.getElementById('btn-reindex-all');
const btnRefreshTickets = document.getElementById('btn-refresh-tickets');
const btnPurgeResolved = document.getElementById('btn-purge-resolved');
const ticketSearchInput = document.getElementById('ticket-search-input');
const ticketStatusFilter = document.getElementById('ticket-status-filter');
const ticketPriorityFilter = document.getElementById('ticket-priority-filter');

let cachedTickets = [];

// Helper: Authenticated Fetch
async function authFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    showAuthError('Session expired or unauthorized. Please sign in again.');
    logout();
    throw new Error('Unauthorized');
  }
  return response;
}

// Show Toast Message
function showToast(message, isError = false) {
  toastBanner.textContent = message;
  toastBanner.style.background = isError ? '#7f1d1d' : '#065f46';
  toastBanner.style.borderColor = isError ? '#ef4444' : '#10b981';
  toastBanner.classList.remove('hidden');
  setTimeout(() => {
    toastBanner.classList.add('hidden');
  }, 4500);
}

// Show Auth Error
function showAuthError(msg) {
  authErrorMsg.textContent = msg;
  authErrorMsg.classList.remove('hidden');
}

// Initialize Application & Auth Check
async function initApp() {
  if (!adminToken) {
    showLoginScreen();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/verify`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    if (res.ok) {
      showDashboard();
      loadAllData();
    } else {
      logout();
    }
  } catch (err) {
    logout();
  }
}

function showLoginScreen() {
  authScreen.classList.remove('hidden');
  dashboardApp.classList.add('hidden');
}

function showDashboard() {
  authScreen.classList.add('hidden');
  dashboardApp.classList.remove('hidden');
}

function logout() {
  adminToken = null;
  sessionStorage.removeItem('cla_admin_token');
  showLoginScreen();
}

// Handle Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authErrorMsg.classList.add('hidden');

  const username = document.getElementById('admin-user').value.trim();
  const password = document.getElementById('admin-pass').value;

  try {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      adminToken = data.token;
      sessionStorage.setItem('cla_admin_token', adminToken);
      showDashboard();
      loadAllData();
    } else {
      showAuthError(data.error || 'Invalid credentials.');
    }
  } catch (err) {
    showAuthError('Failed to connect to authentication service.');
  }
});

btnLogout.addEventListener('click', logout);

// Load All Dashboard Data
async function loadAllData() {
  loadDocuments();
  loadTickets();
  loadTelemetry();
}

// --- DOCUMENTS MANAGEMENT (CRUD) ---
async function loadDocuments() {
  docsTableBody.innerHTML = '<tr><td colspan="6" class="loading-td">Loading documents...</td></tr>';
  try {
    const res = await authFetch(`${API_BASE}/admin/documents`);
    const data = await res.json();

    if (data.success && Array.isArray(data.documents)) {
      statDocsCount.textContent = data.documents.length;
      renderDocumentsTable(data.documents);
    }
  } catch (err) {
    docsTableBody.innerHTML = `<tr><td colspan="6" class="loading-td text-danger">Error loading documents: ${err.message}</td></tr>`;
  }
}

function renderDocumentsTable(documents) {
  if (documents.length === 0) {
    docsTableBody.innerHTML = '<tr><td colspan="6" class="loading-td">No documents found in knowledge base.</td></tr>';
    return;
  }

  docsTableBody.innerHTML = documents.map(doc => `
    <tr>
      <td>
        <span class="doc-name">📄 ${doc.filename}</span>
      </td>
      <td>${doc.sizeKb} KB</td>
      <td>${doc.lineCount} lines</td>
      <td>${doc.wordCount} words</td>
      <td>${new Date(doc.modifiedAt).toLocaleString()}</td>
      <td class="text-right">
        <div class="table-actions">
          <button class="btn-table" onclick="openEditDoc('${doc.filename}')">✏️ Edit</button>
          <button class="btn-table delete" onclick="confirmDeleteDoc('${doc.filename}')">🗑️ Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Open Create Document Modal
btnOpenCreate.addEventListener('click', () => {
  isEditMode = false;
  modalTitle.textContent = 'Create Knowledge Document';
  docFilenameInput.value = '';
  docFilenameInput.disabled = false;
  docContentInput.value = '';
  docModal.classList.remove('hidden');
});

// Open Edit Document Modal
window.openEditDoc = async function(filename) {
  try {
    const res = await authFetch(`${API_BASE}/admin/documents/${filename}`);
    const data = await res.json();

    if (data.success) {
      isEditMode = true;
      modalTitle.textContent = `Edit Document: ${filename}`;
      docFilenameInput.value = data.filename;
      docFilenameInput.disabled = true;
      docContentInput.value = data.content;
      docModal.classList.remove('hidden');
    }
  } catch (err) {
    showToast(`Failed to load document: ${err.message}`, true);
  }
};

// Save Document (Create or Update)
docForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const filename = docFilenameInput.value.trim();
  const content = docContentInput.value;

  const url = isEditMode
    ? `${API_BASE}/admin/documents/${filename}`
    : `${API_BASE}/admin/documents`;
  const method = isEditMode ? 'PUT' : 'POST';

  try {
    const res = await authFetch(url, {
      method,
      body: JSON.stringify({ filename, content })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      docModal.classList.add('hidden');
      showToast(`✓ Document "${filename}" saved & vector store updated!`);
      loadDocuments();
    } else {
      showToast(data.error || 'Failed to save document.', true);
    }
  } catch (err) {
    showToast(`Error saving document: ${err.message}`, true);
  }
});

btnCloseModal.addEventListener('click', () => docModal.classList.add('hidden'));
btnCancelDoc.addEventListener('click', () => docModal.classList.add('hidden'));

// Upload Modal
btnOpenUpload.addEventListener('click', () => {
  fileInput.value = '';
  selectedFilenameSpan.textContent = 'No file selected';
  btnConfirmUpload.disabled = true;
  uploadModal.classList.remove('hidden');
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    selectedFilenameSpan.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    btnConfirmUpload.disabled = false;
  }
});

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (fileInput.files.length === 0) return;

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = async (event) => {
    const content = event.target.result;
    try {
      const res = await authFetch(`${API_BASE}/admin/documents`, {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, content })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        uploadModal.classList.add('hidden');
        showToast(`✓ File "${file.name}" uploaded and indexed successfully!`);
        loadDocuments();
      } else {
        showToast(data.error || 'Failed to upload document.', true);
      }
    } catch (err) {
      showToast(`Error uploading: ${err.message}`, true);
    }
  };

  reader.readAsText(file);
});

btnCloseUpload.addEventListener('click', () => uploadModal.classList.add('hidden'));
btnCancelUpload.addEventListener('click', () => uploadModal.classList.add('hidden'));

// Delete Modal
window.confirmDeleteDoc = function(filename) {
  currentDeletingFilename = filename;
  deleteFilenameLabel.textContent = filename;
  deleteModal.classList.remove('hidden');
};

btnConfirmDelete.addEventListener('click', async () => {
  if (!currentDeletingFilename) return;

  try {
    const res = await authFetch(`${API_BASE}/admin/documents/${currentDeletingFilename}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (res.ok && data.success) {
      deleteModal.classList.add('hidden');
      showToast(`✓ Document "${currentDeletingFilename}" deleted & vector store re-indexed!`);
      loadDocuments();
    } else {
      showToast(data.error || 'Failed to delete document.', true);
    }
  } catch (err) {
    showToast(`Error deleting document: ${err.message}`, true);
  }
});

btnCloseDelete.addEventListener('click', () => deleteModal.classList.add('hidden'));
btnCancelDelete.addEventListener('click', () => deleteModal.classList.add('hidden'));

// Re-index All Button
btnReindexAll.addEventListener('click', async () => {
  btnReindexAll.disabled = true;
  btnReindexAll.innerHTML = '<span>Re-indexing...</span>';
  try {
    const res = await authFetch(`${API_BASE}/admin/reindex`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('✓ Vector store re-indexed successfully with all active documents!');
    }
  } catch (err) {
    showToast('Failed to trigger re-index.', true);
  } finally {
    btnReindexAll.disabled = false;
    btnReindexAll.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
      <span>Re-index Vector Store</span>
    `;
  }
});

// --- ESCALATED TICKETS & LEADS ---
async function loadTickets() {
  ticketsTableBody.innerHTML = '<tr><td colspan="9" class="loading-td">Loading escalation tickets...</td></tr>';
  try {
    const res = await authFetch(`${API_BASE}/admin/tickets`);
    const data = await res.json();

    if (data.success && Array.isArray(data.tickets)) {
      cachedTickets = data.tickets;
      statTicketsCount.textContent = data.tickets.length;
      applyTicketFilters();
    }
  } catch (err) {
    ticketsTableBody.innerHTML = `<tr><td colspan="9" class="loading-td text-danger">Error loading tickets: ${err.message}</td></tr>`;
  }
}

function applyTicketFilters() {
  const searchTerm = (ticketSearchInput.value || '').trim().toLowerCase();
  const statusFilter = ticketStatusFilter.value;
  const priorityFilter = ticketPriorityFilter.value;

  const filtered = cachedTickets.filter(t => {
    const lead = t.lead_info || {};
    const fullName = (lead.name || '').toLowerCase();
    const phone = (lead.phone || '').toLowerCase();
    const email = (lead.email || '').toLowerCase();
    const topic = (lead.topic || t.reason || '').toLowerCase();
    const ticketId = (t.ticket_id || '').toLowerCase();

    // 1. Text Search Filter
    if (searchTerm) {
      const matchesSearch = fullName.includes(searchTerm) ||
        phone.includes(searchTerm) ||
        email.includes(searchTerm) ||
        topic.includes(searchTerm) ||
        ticketId.includes(searchTerm);
      if (!matchesSearch) return false;
    }

    // 2. Status Filter
    if (statusFilter !== 'ALL') {
      const isResolved = t.status === 'RESOLVED';
      if (statusFilter === 'PENDING' && isResolved) return false;
      if (statusFilter === 'RESOLVED' && !isResolved) return false;
    }

    // 3. Priority Filter
    if (priorityFilter !== 'ALL') {
      const ticketPriority = (t.priority || 'MEDIUM').toUpperCase();
      if (ticketPriority !== priorityFilter) return false;
    }

    return true;
  });

  renderTicketsTable(filtered);
}

function renderTicketsTable(tickets) {
  if (tickets.length === 0) {
    ticketsTableBody.innerHTML = '<tr><td colspan="9" class="loading-td">No tickets match the selected filters.</td></tr>';
    return;
  }

  ticketsTableBody.innerHTML = tickets.map(t => {
    const lead = t.lead_info || {};
    const fullName = lead.name || 'Estudiante';
    const firstName = lead.first_name || fullName.split(' ')[0] || 'Estudiante';
    const phone = lead.phone || 'N/A';
    const email = lead.email || 'N/A';
    const topic = lead.topic || t.reason || 'Asesoría general';
    const isResolved = t.status === 'RESOLVED';
    const priorityClass = (t.priority || '').toLowerCase() === 'high' ? 'high' : 'medium';

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const fullPhone = cleanPhone.startsWith('57') ? cleanPhone : ('57' + cleanPhone);
    const defaultMsg = encodeURIComponent(`Hola ${firstName}, he recibido la solicitud de tu caso [Ticket ${t.ticket_id}] respecto a: ${topic}. Me pongo en contacto contigo para ayudarte a resolverlo.`);
    const waUrl = `https://wa.me/${fullPhone}?text=${defaultMsg}`;

    return `
      <tr>
        <td><strong>${t.ticket_id}</strong></td>
        <td><span class="badge ${priorityClass}">${t.priority || 'MEDIUM'}</span></td>
        <td><strong>${fullName}</strong></td>
        <td><code>+${fullPhone}</code></td>
        <td>${email}</td>
        <td><small>${topic}</small></td>
        <td>
          <button class="badge ${isResolved ? 'resolved' : 'pending'}" onclick="toggleTicketStatus('${t.ticket_id}', '${isResolved ? 'PENDING_HUMAN_REVIEW' : 'RESOLVED'}')">
            ${isResolved ? '✓ RESOLVED' : '⏳ PENDING'}
          </button>
        </td>
        <td><small>${new Date(t.timestamp).toLocaleDateString()}</small></td>
        <td class="text-right">
          <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn-table whatsapp">
            💬 WhatsApp
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

window.toggleTicketStatus = async function(ticketId, newStatus) {
  try {
    const res = await authFetch(`${API_BASE}/admin/tickets/${ticketId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Ticket ${ticketId} marked as ${newStatus}`);
      loadTickets();
    }
  } catch (err) {
    showToast(`Failed to update ticket: ${err.message}`, true);
  }
};

// Purge Resolved Tickets Button
btnPurgeResolved.addEventListener('click', async () => {
  const resolvedCount = cachedTickets.filter(t => t.status === 'RESOLVED').length;
  if (resolvedCount === 0) {
    showToast('No resolved tickets to purge.');
    return;
  }

  if (!confirm(`Are you sure you want to permanently delete ${resolvedCount} resolved ticket(s)?`)) {
    return;
  }

  try {
    const res = await authFetch(`${API_BASE}/admin/tickets/resolved`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`✓ ${data.message}`);
      loadTickets();
    } else {
      showToast(data.error || 'Failed to purge resolved tickets.', true);
    }
  } catch (err) {
    showToast(`Error purging tickets: ${err.message}`, true);
  }
});

ticketSearchInput.addEventListener('input', applyTicketFilters);
ticketStatusFilter.addEventListener('change', applyTicketFilters);
ticketPriorityFilter.addEventListener('change', applyTicketFilters);
btnRefreshTickets.addEventListener('click', loadTickets);

// --- TELEMETRY ---
async function loadTelemetry() {
  try {
    const res = await fetch(`${API_BASE}/metrics`);
    const json = await res.json();
    if (json.success && json.data) {
      const d = json.data;
      statQueriesCount.textContent = d.totalQueries || 0;
      statCostVal.textContent = d.tokenUsage?.estimatedCostUSD || '$0.0000';
      document.getElementById('tel-latency').textContent = `${d.averageLatencyMs || 0} ms`;
      document.getElementById('tel-sessions').textContent = d.activeSessionsCount || 0;
      document.getElementById('tel-tokens').textContent = (d.tokenUsage?.totalEstimatedTokens || 0).toLocaleString();
      document.getElementById('tel-cost').textContent = `${d.tokenUsage?.estimatedCostUSD || '$0.0000'} USD`;
    }
  } catch (err) {
    console.warn('Telemetry load error:', err);
  }
}

// Tab Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(tabId).classList.add('active');
  });
});

// Run Init
initApp();
