import express from 'express';
import { handleChat, handleGetMetrics, handleIngest } from '../controllers/chatController.js';
import {
  handleAdminLogin,
  handleAdminVerify,
  handleListDocuments,
  handleGetDocument,
  handleCreateDocument,
  handleUpdateDocument,
  handleDeleteDocument,
  handleGetTickets,
  handleUpdateTicketStatus
} from '../controllers/adminController.js';
import { requireAdminAuth } from '../services/authService.js';

const router = express.Router();

// --- Public Endpoints (No authentication required) ---
router.post('/chat', handleChat);
router.get('/metrics', handleGetMetrics);
router.post('/ingest', handleIngest);

// --- Admin Authentication ---
router.post('/admin/login', handleAdminLogin);
router.get('/admin/verify', requireAdminAuth, handleAdminVerify);

// --- Admin Protected Document CRUD Endpoints ---
router.get('/admin/documents', requireAdminAuth, handleListDocuments);
router.get('/admin/documents/:filename', requireAdminAuth, handleGetDocument);
router.post('/admin/documents', requireAdminAuth, handleCreateDocument);
router.put('/admin/documents/:filename', requireAdminAuth, handleUpdateDocument);
router.delete('/admin/documents/:filename', requireAdminAuth, handleDeleteDocument);

// --- Admin Protected Escalation Tickets & Operations ---
router.get('/admin/tickets', requireAdminAuth, handleGetTickets);
router.put('/admin/tickets/:ticketId/status', requireAdminAuth, handleUpdateTicketStatus);
router.post('/admin/reindex', requireAdminAuth, handleIngest);

export default router;
