import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { TaskType } from '@google/generative-ai';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { config, validateEnv } from '../config/env.js';

let cachedVectorStore = null;

/**
 * Clears the in-memory cached vector store instance so subsequent queries reload the updated index.
 */
export function clearVectorStoreCache() {
  cachedVectorStore = null;
}

/**
 * Initializes or retrieves the cached HNSWLib vector store.
 * @returns {Promise<HNSWLib>}
 */
export async function getVectorStore() {
  if (cachedVectorStore) {
    return cachedVectorStore;
  }

  validateEnv();

  const vectorStoreDir = config.vectorStore.path;
  const indexPath = path.join(vectorStoreDir, 'hnswlib.index');
  const docstorePath = path.join(vectorStoreDir, 'docstore.json');

  if (!fs.existsSync(indexPath) && !fs.existsSync(docstorePath)) {
    throw new Error(
      `Vector store index not found at ${vectorStoreDir}. Please run "npm run rag:ingest" first.`
    );
  }

  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: config.gemini.apiKey,
    modelName: config.gemini.embeddingModel,
    taskType: TaskType.RETRIEVAL_QUERY
  });

  cachedVectorStore = await HNSWLib.load(vectorStoreDir, embeddings);
  return cachedVectorStore;
}

/**
 * Query the vector store for top-K relevant documents.
 * @param {string} query - The user search query.
 * @param {number} topK - Number of chunks to retrieve (default: 4).
 * @returns {Promise<Array<{content: string, metadata: object, score?: number}>>}
 */
export async function searchSimilarDocuments(query, topK = 4) {
  const store = await getVectorStore();
  
  // similaritySearchWithScore returns [[Document, score], ...]
  const resultsWithScore = await store.similaritySearchWithScore(query, topK);
  
  return resultsWithScore.map(([doc, score]) => ({
    content: doc.pageContent,
    metadata: doc.metadata,
    score: score
  }));
}

/**
 * Retrieves and formats relevant context into a clean text block for LLM prompt injection.
 * @param {string} query
 * @param {number} topK
 * @returns {Promise<{ contextText: string, sources: Array<string>, rawResults: Array<object> }>}
 */
export async function getFormattedContext(query, topK = 4) {
  const results = await searchSimilarDocuments(query, topK);

  if (!results || results.length === 0) {
    return {
      contextText: 'No relevant information found in the knowledge base.',
      sources: [],
      rawResults: []
    };
  }

  const uniqueSources = [...new Set(results.map(r => r.metadata?.source || 'Unknown'))];

  const formattedSections = results.map((res, index) => {
    const src = res.metadata?.source || 'Knowledge Base';
    return `[Context Chunk ${index + 1} | Source: ${src}]\n${res.content.trim()}`;
  });

  return {
    contextText: formattedSections.join('\n\n---\n\n'),
    sources: uniqueSources,
    rawResults: results
  };
}
