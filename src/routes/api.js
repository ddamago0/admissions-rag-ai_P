import { Router } from 'express';
import { handleChat, handleGetMetrics, handleIngest } from '../controllers/chatController.js';

const router = Router();

// Chatbot RAG inquiry endpoint
router.post('/chat', handleChat);

// Real-time system and operational metrics
router.get('/metrics', handleGetMetrics);

// Dynamic knowledge base re-ingestion
router.post('/ingest', handleIngest);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'Colombia Language Academy Assistant API',
    timestamp: new Date().toISOString()
  });
});

export default router;
