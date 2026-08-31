import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import apiRoutes from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Standard middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));

// Mount API routes
app.use('/api', apiRoutes);

// Root fallback to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(config.nodeEnv === 'development' ? { stack: err.stack } : {})
  });
});

// Start Express Server
const server = app.listen(config.port, () => {
  console.log('========================================================================');
  console.log(`Colombia Language Academy AI Assistant Server running`);
  console.log(`- Web UI: http://localhost:${config.port}`);
  console.log(`- API Base: http://localhost:${config.port}/api`);
  console.log(`- Metrics: http://localhost:${config.port}/api/metrics`);
  console.log(`- Environment: ${config.nodeEnv}`);
  console.log('========================================================================');
});

export default app;
