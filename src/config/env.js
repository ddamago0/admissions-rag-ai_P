import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export function validateEnv() {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here' || GEMINI_API_KEY.trim() === '') {
    const errorMsg = [
      '========================================================================',
      '[CONFIG ERROR] Missing or invalid GEMINI_API_KEY!',
      'Please ensure GEMINI_API_KEY is defined in your .env file.',
      'Example: GEMINI_API_KEY=AIzaSy...',
      '========================================================================'
    ].join('\n');
    throw new Error(errorMsg);
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    chatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash-lite',
    temperature: 0.1
  },
  vectorStore: {
    path: path.resolve(__dirname, '../../', process.env.VECTOR_STORE_PATH || './vectorstore')
  },
  automation: {
    orchestratorUrl: process.env.PYTHON_ORCHESTRATOR_URL || 'http://localhost:5000/webhook/escalations'
  },
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin2026',
    jwtSecret: process.env.ADMIN_JWT_SECRET || 'cla_super_secret_admin_jwt_key_2026_secure'
  }
};
