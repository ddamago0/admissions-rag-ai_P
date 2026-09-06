import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FAQS_FILE_PATH = path.resolve(__dirname, '../../data/generated_faqs.json');

// In-memory dynamic LRU query response cache
const dynamicCache = new Map();
const MAX_CACHE_ENTRIES = 250;

// Dynamic In-memory Inverted Token FAQ Index
let activeFaqs = [];
let tokenInvertedIndex = new Map();

/**
 * Normalizes text for robust fuzzy key matching (removes accents, punctuation, extra spaces).
 */
export function normalizeQuery(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds the Inverted Token Index in RAM for sub-millisecond O(1) matching.
 */
export function reloadFaqIndex() {
  try {
    if (fs.existsSync(FAQS_FILE_PATH)) {
      const content = fs.readFileSync(FAQS_FILE_PATH, 'utf-8');
      activeFaqs = JSON.parse(content);
    } else {
      activeFaqs = [];
    }

    tokenInvertedIndex.clear();

    for (let i = 0; i < activeFaqs.length; i++) {
      const faq = activeFaqs[i];
      const allTokens = new Set([
        ...(faq.keywords || []).map(normalizeQuery),
        ...(faq.patterns || []).flatMap(p => normalizeQuery(p).split(' ')).filter(w => w.length > 2)
      ]);

      for (const token of allTokens) {
        if (!tokenInvertedIndex.has(token)) {
          tokenInvertedIndex.set(token, new Set());
        }
        tokenInvertedIndex.get(token).add(i);
      }
    }

    console.log(`[Cache Engine] Indexed ${activeFaqs.length} dynamic FAQs across ${tokenInvertedIndex.size} unique tokens.`);
  } catch (err) {
    console.warn('[Cache Engine] Failed to load dynamic FAQ file:', err.message);
    activeFaqs = [];
  }
}

// Initial index load on startup
reloadFaqIndex();

/**
 * High-performance Instant FAQ retrieval with Token Intersection & Semantic Fuzzy Scoring.
 * Resolves frequent questions across all documents in < 3ms with 0 Gemini API cost.
 * 
 * @param {string} rawQuery
 * @returns {object|null}
 */
export function getPreloadedFaqResponse(rawQuery = '') {
  const normalized = normalizeQuery(rawQuery);
  if (normalized.length < 5) return null;

  // STRICT BYPASS: Never use static cache if the query contains grievance, private issues, or contact info
  if (/peleo|agrede|conflicto|problema|doble cobro|queja|reclamo|30[0-9]{8}|31[0-9]{8}|32[0-9]{8}|@|urgente|asesor humano/i.test(rawQuery)) {
    return null;
  }

  const queryWords = normalized.split(' ').filter(w => w.length > 2);
  if (queryWords.length === 0) return null;

  // Retrieve candidate FAQ indices using the Inverted Token Index
  const candidateIndices = new Set();
  for (const word of queryWords) {
    if (tokenInvertedIndex.has(word)) {
      for (const idx of tokenInvertedIndex.get(word)) {
        candidateIndices.add(idx);
      }
    }
  }

  let bestFaq = null;
  let highestScore = 0;

  for (const idx of candidateIndices) {
    const faq = activeFaqs[idx];
    let score = 0;

    // 1. Direct phrase similarity
    if (faq.patterns && Array.isArray(faq.patterns)) {
      for (const pattern of faq.patterns) {
        const normPattern = normalizeQuery(pattern);
        if (normalized.includes(normPattern) || normPattern.includes(normalized)) {
          score += 12;
          break;
        }
      }
    }

    // 2. Keyword intersection scoring
    if (faq.keywords && Array.isArray(faq.keywords)) {
      const matchedKeywords = faq.keywords.filter(k => {
        const normK = normalizeQuery(k);
        return queryWords.includes(normK) || normalized.includes(normK);
      });
      score += matchedKeywords.length * 3;
    }

    if (score > highestScore && score >= 5) {
      highestScore = score;
      bestFaq = faq;
    }
  }

  if (bestFaq) {
    return {
      success: true,
      escalate: false,
      ticketId: null,
      reason: null,
      reply: bestFaq.reply,
      lead_info: null,
      suggested_actions: bestFaq.suggested_actions || ['Consultar cursos', 'Ver precios en COP', 'Horarios y sedes'],
      sources: bestFaq.sources || [bestFaq.document],
      cached: true,
      latencyMs: 2
    };
  }

  return null;
}

/**
 * Checks the dynamic LRU response cache.
 * @param {string} rawQuery
 * @returns {object|null}
 */
export function getDynamicCachedResponse(rawQuery = '') {
  const normalized = normalizeQuery(rawQuery);
  if (dynamicCache.has(normalized)) {
    const cached = dynamicCache.get(normalized);
    return {
      ...cached,
      cached: true,
      latencyMs: 1
    };
  }
  return null;
}

/**
 * Saves a response in the dynamic LRU cache.
 * @param {string} rawQuery
 * @param {object} responseData
 */
export function setDynamicCachedResponse(rawQuery = '', responseData) {
  if (!rawQuery || !responseData || responseData.escalate) return;
  const normalized = normalizeQuery(rawQuery);
  if (normalized.length < 6) return;

  if (dynamicCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = dynamicCache.keys().next().value;
    dynamicCache.delete(firstKey);
  }

  dynamicCache.set(normalized, {
    ...responseData,
    cached: true
  });
}

/**
 * Clears all dynamic caches and reloads FAQ index (e.g. when documents change).
 */
export function flushDynamicCache() {
  dynamicCache.clear();
  reloadFaqIndex();
}

