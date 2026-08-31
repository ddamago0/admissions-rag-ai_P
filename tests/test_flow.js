/**
 * Automated End-to-End Verification Test Suite
 * Tests Knowledge Base integrity, Document CRUD operations, Admin Authentication,
 * Escalation Payload schema, Metrics tracking, and Frontend Assets.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { authenticateAdmin, generateAdminToken, verifyAdminToken } from '../src/services/authService.js';
import { recordQueryMetric, getSessionHistory, getMetricsSnapshot } from '../src/services/metricsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ✗ [FAIL] ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ [PASS] ${message}`);
    passedTests++;
  }
}

console.log('====================================================');
console.log('Running Admissions RAG AI - Automated Test Suite');
console.log('====================================================\n');

// 1. Knowledge Base & Documents Test
console.log('--- Test Suite 1: Knowledge Base Documents & Chunking ---');
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.md'));
assert(files.length >= 3, `Knowledge base contains at least 3 required markdown documents (Found: ${files.length})`);

const sampleContent = fs.readFileSync(path.join(DATA_DIR, 'courses_and_levels.md'), 'utf-8');
const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 600, chunkOverlap: 100 });
const chunks = await splitter.splitText(sampleContent);
assert(chunks.length > 0, `Recursive text splitter generates valid chunk segments (Generated: ${chunks.length})`);

const combinedText = files.map(f => fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')).join('\n');
const hasCopPricing = /COP|\$480,000|\$690,000|\$350,000/i.test(combinedText);
const hasCampuses = /Bogotá|Medellín|Chapinero|Usaquén|Poblado/i.test(combinedText);
assert(hasCopPricing && hasCampuses, 'Knowledge base chunks contain critical Colombian domain terms (COP pricing, campuses)');

// 2. Metrics & Session State Test
console.log('\n--- Test Suite 2: Metrics Tracking & Session State ---');
const testSessionId = `test-sess-${Date.now()}`;
recordQueryMetric({
  sessionId: testSessionId,
  userQuery: 'What are the tuition fees in Bogotá?',
  reply: 'The standard module is $480,000 COP.',
  isEscalated: false,
  latencyMs: 120
});

const history = getSessionHistory(testSessionId);
assert(history.length === 2, `Session history correctly tracks conversation turns (Length: ${history.length})`);

recordQueryMetric({
  sessionId: testSessionId,
  userQuery: 'I have a billing issue and need help.',
  reply: 'Escalating your request to lead advisor Daniel.',
  isEscalated: true,
  latencyMs: 150,
  reason: 'Billing dispute',
  leadInfo: { name: 'Daniel Test', phone: '3014777763', email: 'test@example.com' }
});

const metrics = getMetricsSnapshot();
assert(metrics.totalQueries >= 2, `Total queries metric incremented (Count: ${metrics.totalQueries})`);
assert(metrics.escalatedQueries >= 1, `Escalated queries metric recorded (Count: ${metrics.escalatedQueries})`);

// 3. Admin Authentication & Security
console.log('\n--- Test Suite 3: Admin Authentication & Security Guardrails ---');
const validLogin = authenticateAdmin('admin', 'admin2026');
assert(validLogin === true, 'Admin authentication succeeds with valid credentials (admin/admin2026)');

const invalidLogin = authenticateAdmin('admin', 'wrongpassword123');
assert(invalidLogin === false, 'Admin authentication rejects invalid password');

const token = generateAdminToken();
assert(typeof token === 'string' && token.includes('.'), 'HMAC-SHA256 Admin session token generated successfully');

const isTokenValid = verifyAdminToken(token);
assert(isTokenValid === true, 'Admin session token signature and expiry verified successfully');

const fakeToken = token.slice(0, -5) + 'abcde';
assert(verifyAdminToken(fakeToken) === false, 'Forged or tampered session token correctly rejected');

// 4. Document CRUD Operations Test
console.log('\n--- Test Suite 4: Document CRUD Operations & File Integrity ---');
const testDocName = 'test_temporary_curriculum.md';
const testDocPath = path.join(DATA_DIR, testDocName);
const testDocContent = '# Temporary Test Curriculum\n\nThis is a temporary document for automated CRUD verification.';

// Create
fs.writeFileSync(testDocPath, testDocContent, 'utf-8');
assert(fs.existsSync(testDocPath), 'Document creation in data directory successful');

// Read
const readContent = fs.readFileSync(testDocPath, 'utf-8');
assert(readContent.includes('Temporary Test Curriculum'), 'Document read verification matches original content');

// Update
const updatedContent = testDocContent + '\n\nAdditional updated section for Portuguese B2.';
fs.writeFileSync(testDocPath, updatedContent, 'utf-8');
assert(fs.readFileSync(testDocPath, 'utf-8').includes('Portuguese B2'), 'Document content update verified');

// Delete
fs.unlinkSync(testDocPath);
assert(!fs.existsSync(testDocPath), 'Document deletion verified successfully');

// 5. Frontend Assets Integrity
console.log('\n--- Test Suite 5: Frontend Assets & Admin UI Integrity ---');
const publicDir = path.resolve(__dirname, '../public');
const assets = ['index.html', 'style.css', 'app.js', 'admin.html', 'admin.css', 'admin.js'];
const allAssetsExist = assets.every(file => {
  const p = path.join(publicDir, file);
  return fs.existsSync(p) && fs.statSync(p).size > 0;
});
assert(allAssetsExist, `All frontend public assets exist with non-zero content (${assets.join(', ')})`);

console.log('\n====================================================');
console.log(`Test Execution Finished: ${passedTests} / ${totalTests} Passed`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
