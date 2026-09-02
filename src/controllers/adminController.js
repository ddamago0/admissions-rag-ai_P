import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticateAdmin, generateAdminToken } from '../services/authService.js';
import { runIngestion } from '../rag/ingest.js';
import { clearVectorStoreCache } from '../rag/retriever.js';
import { flushDynamicCache } from '../services/cacheService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const ESCALATIONS_FILE = path.resolve(__dirname, '../../automation/escalations.json');

/**
 * Validates filename to prevent path traversal attacks.
 */
function sanitizeFilename(rawFilename) {
  if (!rawFilename || typeof rawFilename !== 'string') {
    throw new Error('Filename is required.');
  }
  // Strip out directory separators and illegal characters
  const cleanName = path.basename(rawFilename.trim()).replace(/[^a-zA-Z0-9_\-\.]/g, '');
  if (!cleanName.endsWith('.md') && !cleanName.endsWith('.txt')) {
    return `${cleanName}.md`;
  }
  return cleanName;
}

/**
 * POST /api/admin/login
 */
export async function handleAdminLogin(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Both username and password are required.'
      });
    }

    const isValid = authenticateAdmin(username, password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid administrator username or password.'
      });
    }

    const token = generateAdminToken();
    return res.status(200).json({
      success: true,
      message: 'Administrator authentication successful.',
      token,
      admin: {
        username: username.trim(),
        role: 'Administrator',
        loginTime: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Admin Auth Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server authentication error.' });
  }
}

/**
 * POST /api/admin/verify
 */
export async function handleAdminVerify(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Admin session token is valid.',
    authenticated: true
  });
}

/**
 * GET /api/admin/documents
 */
export async function handleListDocuments(req, res) {
  try {
    const files = await fs.readdir(DATA_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.txt'));

    const documentList = await Promise.all(
      mdFiles.map(async (filename) => {
        const filePath = path.join(DATA_DIR, filename);
        const stats = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        const lineCount = content.split('\n').length;
        const wordCount = content.split(/\s+/).filter(Boolean).length;

        return {
          filename,
          sizeBytes: stats.size,
          sizeKb: (stats.size / 1024).toFixed(2),
          lineCount,
          wordCount,
          modifiedAt: stats.mtime.toISOString(),
          createdAt: stats.birthtime.toISOString()
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: documentList.length,
      documents: documentList
    });
  } catch (error) {
    console.error('[List Documents Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/admin/documents/:filename
 */
export async function handleGetDocument(req, res) {
  try {
    const filename = sanitizeFilename(req.params.filename);
    const filePath = path.join(DATA_DIR, filename);

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ success: false, error: `Document "${filename}" not found.` });
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);

    return res.status(200).json({
      success: true,
      filename,
      content,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString()
    });
  } catch (error) {
    console.error('[Get Document Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/admin/documents
 */
export async function handleCreateDocument(req, res) {
  try {
    const { filename, content } = req.body || {};
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ success: false, error: 'Document filename is required.' });
    }
    if (typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ success: false, error: 'Document content cannot be empty.' });
    }

    const safeFilename = sanitizeFilename(filename);
    const filePath = path.join(DATA_DIR, safeFilename);

    // Check if file already exists
    try {
      await fs.access(filePath);
      return res.status(409).json({
        success: false,
        error: `Document "${safeFilename}" already exists. Use PUT to update it.`
      });
    } catch {
      // File doesn't exist, proceed
    }

    await fs.writeFile(filePath, content.trim(), 'utf-8');
    console.log(`[Admin] Created new knowledge base document: ${safeFilename}`);

    // Dynamic auto-reindex into vectorstore
    let reindexed = false;
    try {
      await runIngestion();
      clearVectorStoreCache();
      flushDynamicCache();
      reindexed = true;
    } catch (ingestErr) {
      console.warn(`[Admin Auto-Ingest Warning]: ${ingestErr.message}`);
    }

    return res.status(201).json({
      success: true,
      message: `Document "${safeFilename}" created successfully. Vector store automatically updated.`,
      filename: safeFilename,
      reindexed
    });
  } catch (error) {
    console.error('[Create Document Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PUT /api/admin/documents/:filename
 */
export async function handleUpdateDocument(req, res) {
  try {
    const safeFilename = sanitizeFilename(req.params.filename);
    const { content } = req.body || {};

    if (typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ success: false, error: 'Document content cannot be empty.' });
    }

    const filePath = path.join(DATA_DIR, safeFilename);

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ success: false, error: `Document "${safeFilename}" not found.` });
    }

    await fs.writeFile(filePath, content.trim(), 'utf-8');
    console.log(`[Admin] Updated knowledge base document: ${safeFilename}`);

    // Auto-reindex
    let reindexed = false;
    try {
      await runIngestion();
      clearVectorStoreCache();
      flushDynamicCache();
      reindexed = true;
    } catch (ingestErr) {
      console.warn(`[Admin Auto-Ingest Warning]: ${ingestErr.message}`);
    }

    return res.status(200).json({
      success: true,
      message: `Document "${safeFilename}" updated successfully and vector store re-indexed.`,
      filename: safeFilename,
      reindexed
    });
  } catch (error) {
    console.error('[Update Document Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * DELETE /api/admin/documents/:filename
 */
export async function handleDeleteDocument(req, res) {
  try {
    const safeFilename = sanitizeFilename(req.params.filename);
    const filePath = path.join(DATA_DIR, safeFilename);

    const files = await fs.readdir(DATA_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.txt'));

    if (mdFiles.length <= 1) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete the last remaining knowledge base document. At least one document must exist.'
      });
    }

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ success: false, error: `Document "${safeFilename}" not found.` });
    }

    await fs.unlink(filePath);
    console.log(`[Admin] Deleted knowledge base document: ${safeFilename}`);

    // Auto-reindex
    let reindexed = false;
    try {
      await runIngestion();
      clearVectorStoreCache();
      flushDynamicCache();
      reindexed = true;
    } catch (ingestErr) {
      console.warn(`[Admin Auto-Ingest Warning]: ${ingestErr.message}`);
    }

    return res.status(200).json({
      success: true,
      message: `Document "${safeFilename}" deleted successfully and vector store re-indexed.`,
      filename: safeFilename,
      reindexed
    });
  } catch (error) {
    console.error('[Delete Document Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/admin/tickets
 */
export async function handleGetTickets(req, res) {
  try {
    let tickets = [];
    try {
      await fs.access(ESCALATIONS_FILE);
      const rawData = await fs.readFile(ESCALATIONS_FILE, 'utf-8');
      tickets = JSON.parse(rawData);
    } catch {
      tickets = [];
    }

    // Sort descending by timestamp
    tickets.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({
      success: true,
      count: tickets.length,
      tickets
    });
  } catch (error) {
    console.error('[Get Tickets Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PUT /api/admin/tickets/:ticketId/status
 */
export async function handleUpdateTicketStatus(req, res) {
  try {
    const { ticketId } = req.params;
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required.' });
    }

    let tickets = [];
    try {
      const rawData = await fs.readFile(ESCALATIONS_FILE, 'utf-8');
      tickets = JSON.parse(rawData);
    } catch {
      return res.status(404).json({ success: false, error: 'No tickets found.' });
    }

    const ticketIndex = tickets.findIndex(t => t.ticket_id === ticketId);
    if (ticketIndex === -1) {
      return res.status(404).json({ success: false, error: `Ticket "${ticketId}" not found.` });
    }

    tickets[ticketIndex].status = status;
    tickets[ticketIndex].updatedAt = new Date().toISOString();

    await fs.writeFile(ESCALATIONS_FILE, JSON.stringify(tickets, null, 2), 'utf-8');

    return res.status(200).json({
      success: true,
      message: `Ticket "${ticketId}" status updated to ${status}.`,
      ticket: tickets[ticketIndex]
    });
  } catch (error) {
    console.error('[Update Ticket Status Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
