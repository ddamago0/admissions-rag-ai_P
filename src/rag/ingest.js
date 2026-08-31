import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { TaskType } from '@google/generative-ai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { Document } from '@langchain/core/documents';
import { config, validateEnv } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
