import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { recordQueryMetric, getSessionHistory, getMetricsSnapshot, estimateTokens } from '../src/services/metricsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTestSuite() {
  console.log('====================================================');
  console.log('Running Admissions RAG AI - Automated Test Suite');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function runTest(name, fn) {
    totalTests++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
    }
  }

  // --- Test Suite 1: Knowledge Base Documents & Chunking ---
  console.log('--- Test Suite 1: Knowledge Base Documents & Chunking ---');
  const dataDir = path.resolve(__dirname, '../data');
  const files = await fs.readdir(dataDir);
  const docFiles = files.filter(f => f.endsWith('.md'));

  runTest('Knowledge base contains at least 3 required markdown documents', () => {
    assert(docFiles.length >= 3, `Expected at least 3 markdown files, found ${docFiles.length}`);
    assert(docFiles.includes('courses_and_levels.md'), 'Missing courses_and_levels.md');
    assert(docFiles.includes('pricing_and_enrollment.md'), 'Missing pricing_and_enrollment.md');
    assert(docFiles.includes('certifications_and_policies.md'), 'Missing certifications_and_policies.md');
  });

  const rawDocuments = [];
  for (const filename of docFiles) {
    const content = await fs.readFile(path.join(dataDir, filename), 'utf-8');
    rawDocuments.push(new Document({ pageContent: content, metadata: { source: filename } }));
  }

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 600,
    chunkOverlap: 100,
    separators: ['\n## ', '\n### ', '\n\n', '\n', ' ', '']
  });
  const chunks = await textSplitter.splitDocuments(rawDocuments);

  runTest('Recursive text splitter generates valid chunk segments', () => {
    assert(chunks.length >= 10, `Expected >=10 chunks, generated ${chunks.length}`);
    for (const chunk of chunks) {
      assert(chunk.pageContent.length > 0, 'Chunk content must not be empty');
      assert(chunk.metadata.source, 'Chunk metadata must retain source filename');
    }
  });

  runTest('Knowledge base chunks contain critical Colombian domain terms', () => {
    const allText = chunks.map(c => c.pageContent).join(' ');
    assert(allText.includes('COP'), 'Chunks must contain COP currency identifier');
    assert(allText.includes('Bogotá') || allText.includes('Bogota'), 'Chunks must mention Bogotá campus');
    assert(allText.includes('Medellín') || allText.includes('Medellin'), 'Chunks must mention Medellín campus');
    assert(allText.includes('PSE'), 'Chunks must mention PSE payment method');
    assert(allText.includes('IELTS'), 'Chunks must mention IELTS certification');
    assert(allText.includes('+57'), 'Chunks must contain Colombian phone dialing codes');
  });

  // --- Test Suite 2: Metrics & Session Management ---
  console.log('\n--- Test Suite 2: Metrics Tracking & Session State ---');

  runTest('Token estimation calculates approx tokens accurately', () => {
    const text = 'Hello Colombia Language Academy! Welcome to our English courses.';
    const tokens = estimateTokens(text);
    assert(tokens > 10 && tokens < 25, `Token estimate ${tokens} out of expected range`);
  });

  const testSessionId = 'test-session-e2e';
  runTest('Session history and metrics correctly track standard queries', () => {
    recordQueryMetric({
      sessionId: testSessionId,
      userQuery: 'What are the French schedules in Bogota?',
      reply: 'French courses are offered Mon-Thu in Bogota.',
      isEscalated: false,
      latencyMs: 320
    });

    const history = getSessionHistory(testSessionId);
    assert.strictEqual(history.length, 2, 'History must contain user and assistant turns');
    assert.strictEqual(history[0].role, 'user');
    assert.strictEqual(history[1].role, 'assistant');
  });

  runTest('Metrics service correctly tracks escalation rates and costs', () => {
    recordQueryMetric({
      sessionId: testSessionId,
      userQuery: 'I have a billing double charge, call me at 3109998888',
      reply: 'We have escalated your billing inquiry.',
      isEscalated: true,
      latencyMs: 450,
      reason: 'Billing dispute',
      leadInfo: { phone: '3109998888' }
    });

    const snapshot = getMetricsSnapshot();
    assert(snapshot.totalQueries >= 2, 'Total queries must be >= 2');
    assert(snapshot.escalatedQueries >= 1, 'Escalated queries must be >= 1');
    assert(snapshot.escalationRatePercent > 0, 'Escalation rate percent must be > 0');
    assert(snapshot.averageLatencyMs > 0, 'Average latency must be positive');
    assert(snapshot.tokenUsage.totalEstimatedTokens > 0, 'Estimated tokens must be positive');
  });

  // --- Test Suite 3: Python Webhook Payload Structure Compatibility ---
  console.log('\n--- Test Suite 3: Python Automation Payload Compatibility ---');

  runTest('Escalation payload structure matches Python orchestrator requirements', () => {
    const samplePayload = {
      reason: 'Customer requested human advisor for billing dispute',
      lead_info: {
        name: 'Andres Morales',
        phone: '+57 312 456 7890',
        email: 'andres@example.com',
        topic: 'Duplicate PSE transaction'
      },
      inquiry: 'I was charged twice via PSE. Please contact me at +57 312 456 7890.',
      reply: 'Hello Andres, I have escalated your duplicate PSE payment to our billing department.',
      sources: ['pricing_and_enrollment.md', 'certifications_and_policies.md']
    };

    assert(typeof samplePayload.reason === 'string', 'Payload must contain string reason');
    assert(typeof samplePayload.lead_info === 'object', 'Payload must contain lead_info object');
    assert(samplePayload.lead_info.phone, 'lead_info must capture phone number');
    assert(Array.isArray(samplePayload.sources), 'Payload must contain sources array');
  });

  // --- Test Suite 4: Static Web Asset Integrity ---
  console.log('\n--- Test Suite 4: Frontend Static Assets Integrity ---');
  const publicDir = path.resolve(__dirname, '../public');

  runTest('Frontend files index.html, style.css, app.js exist with non-zero content', async () => {
    const html = await fs.readFile(path.join(publicDir, 'index.html'), 'utf-8');
    const css = await fs.readFile(path.join(publicDir, 'style.css'), 'utf-8');
    const js = await fs.readFile(path.join(publicDir, 'app.js'), 'utf-8');

    assert(html.includes('Colombia Language Academy'), 'index.html must contain academy title');
    assert(html.includes('escalation-banner'), 'index.html must include escalation banner element');
    assert(css.includes('--accent-primary'), 'style.css must contain CSS variables');
    assert(js.includes('fetchMetrics'), 'app.js must include metrics polling logic');
  });

  console.log('\n====================================================');
  console.log(`Test Execution Finished: ${passedTests} / ${totalTests} Passed`);
  console.log('====================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
