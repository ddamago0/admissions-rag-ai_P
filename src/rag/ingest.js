import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { TaskType } from '@google/generative-ai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { Document } from '@langchain/core/documents';
import { clearVectorStoreCache } from './retriever.js';
import { reloadFaqIndex } from '../services/cacheService.js';
import { config, validateEnv } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FAQS_FILE_PATH = path.resolve(__dirname, '../../data/generated_faqs.json');

/**
 * Automatically synthesizes structured FAQ entries from raw Markdown content.
 */
export function synthesizeFaqsFromMarkdown(filename, content) {
  const sections = content.split(/\n(?=##?\s+)/);
  const cleanTitle = filename.replace(/\.(md|txt)$/, '').replace(/_/g, ' ');
  const generated = [];

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i].trim();
    if (!sec || sec.length < 25) continue;

    const firstLine = sec.split('\n')[0].replace(/^#+\s*/, '').replace(/^[0-9.]+\s*/, '').trim();
    if (!firstLine || firstLine.toLowerCase().includes('overview')) continue;

    const words = firstLine.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(' ')
      .filter(w => w.length > 2);

    const docWords = cleanTitle.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(' ')
      .filter(w => w.length > 2);

    const patterns = [
      firstLine.toLowerCase(),
      `informacion sobre ${firstLine.toLowerCase()}`,
      `requisitos de ${firstLine.toLowerCase()}`,
      `como funciona ${firstLine.toLowerCase()}`
    ];

    generated.push({
      id: `auto-${filename.replace(/\.[^.]+$/, '')}-${i + 1}`,
      document: filename,
      title: `${cleanTitle} - ${firstLine}`,
      keywords: Array.from(new Set([...words, ...docWords])),
      patterns,
      reply: sec.length > 550 ? sec.slice(0, 520) + '...' : sec,
      sources: [filename],
      suggested_actions: ['Consultar cursos', 'Ver precios en COP', 'Hablar con un asesor']
    });
  }

  return generated;
}

async function runIngestion() {
  console.log('====================================================');
  console.log('Starting Knowledge Base Ingestion Pipeline');
  console.log('====================================================');

  try {
    validateEnv();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const dataDir = path.resolve(__dirname, '../../data');
  const vectorStoreDir = config.vectorStore.path;

  console.log(`[1/5] Scanning data directory: ${dataDir}`);
  const files = await fs.readdir(dataDir);
  const docFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.txt'));

  if (docFiles.length === 0) {
    console.error(`[ERROR] No document files (.md, .txt) found in ${dataDir}`);
    process.exit(1);
  }

  console.log(`[2/5] Found ${docFiles.length} documents: ${docFiles.join(', ')}`);

  const rawDocuments = [];
  const allSynthesizedFaqs = [];

  for (const filename of docFiles) {
    const filePath = path.join(dataDir, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    rawDocuments.push(
      new Document({
        pageContent: content,
        metadata: {
          source: filename,
          title: filename.replace(/\.(md|txt)$/, '').replace(/_/g, ' ')
        }
      })
    );

    // Auto-synthesize FAQs for this document
    const docFaqs = synthesizeFaqsFromMarkdown(filename, content);
    allSynthesizedFaqs.push(...docFaqs);
  }

  // Persist / Update auto-generated FAQs knowledge base
  try {
    let existingFaqs = [];
    try {
      const existingData = await fs.readFile(FAQS_FILE_PATH, 'utf-8');
      existingFaqs = JSON.parse(existingData);
    } catch (_) {
      existingFaqs = [];
    }

    // Merge without duplicates by document
    const nonAutoFaqs = existingFaqs.filter(f => !f.id || !f.id.startsWith('auto-'));
    const finalFaqs = [...nonAutoFaqs, ...allSynthesizedFaqs];
    await fs.writeFile(FAQS_FILE_PATH, JSON.stringify(finalFaqs, null, 2), 'utf-8');
    console.log(`[Cache Ingestion] Updated ${finalFaqs.length} instant FAQ entries in data/generated_faqs.json`);
  } catch (faqErr) {
    console.warn('[Cache Ingestion Warning] Failed to update FAQ cache:', faqErr.message);
  }

  console.log('[3/5] Chunking documents with RecursiveCharacterTextSplitter (chunkSize: 600, overlap: 100)...');
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 600,
    chunkOverlap: 100,
    separators: ['\n## ', '\n### ', '\n\n', '\n', ' ', '']
  });

  const chunks = await textSplitter.splitDocuments(rawDocuments);
  console.log(`[3/5] Generated ${chunks.length} chunks across ${rawDocuments.length} source documents.`);

  console.log(`[4/5] Generating Google Gemini embeddings with model "${config.gemini.embeddingModel}"...`);
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: config.gemini.apiKey,
    modelName: config.gemini.embeddingModel,
    taskType: TaskType.RETRIEVAL_DOCUMENT
  });

  console.log('[5/5] Building and persisting HNSWLib vector store...');
  // Ensure target directory exists
  await fs.mkdir(vectorStoreDir, { recursive: true });

  const vectorStore = await HNSWLib.fromDocuments(chunks, embeddings);
  await vectorStore.save(vectorStoreDir);
  clearVectorStoreCache();
  reloadFaqIndex();

  console.log('====================================================');
  console.log('Ingestion Completed Successfully!');
  console.log(`- Total Chunks Indexed: ${chunks.length}`);
  console.log(`- Vector Store Location: ${vectorStoreDir}`);
  console.log('====================================================');
}

// Allow running directly via CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runIngestion().catch((err) => {
    console.error('[FATAL] Ingestion pipeline failed:', err);
    process.exit(1);
  });
}

export { runIngestion };

