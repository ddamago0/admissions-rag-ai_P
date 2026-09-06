/**
 * Local Deterministic Guardrails Service (Fast-Path Pre-LLM Evaluator)
 * 
 * Intercepts and short-circuits off-topic queries (arithmetic, code generation,
 * prompt injections, jailbreaks, non-academic queries) at the Express/Node.js level.
 * 
 * Guarantees:
 * - 0 tokens consumed ($0 API cost)
 * - Sub-millisecond execution (< 1ms)
 * - Safe boundary checks (\b) to avoid false positives on prices, schedules, or "código de conducta".
 */

// ============================================================================
// MODULAR & EXPORTABLE PATTERN DEFINITIONS
// ============================================================================

/**
 * Legitimate admissions phrases that contain potential guardrail keywords
 * but MUST NEVER be blocked (Whitelist Exclusions).
 */
export const WHITELIST_EXCLUSIONS = [
  /\bc[oó]digo\s+de\s+conducta\b/i,
  /\bc[oó]digo\s+de\s+vestimenta\b/i,
  /\bc[oó]digo\s+de\s+descuento\b/i,
  /\bc[oó]digo\s+postal\b/i,
  /\bdescuento\b/i,
  /\bpromoci[oó]n\b/i,
  /\bhorarios?\b/i,
  /\bprecios?\b/i,
  /\bmatr[ií]cula\b/i,
  /\bcostos?\b/i,
  /\bcop\b/i
];

/**
 * Mathematical and arithmetic problem patterns.
 * Explicitly checks for calculation intent or pure arithmetic expressions.
 */
export const MATH_PATTERNS = [
  // Explicit math calculation phrases with numbers and operators
  /\b(?:cu[aá]nto\s+es|calcula(?:r)?|resuelve(?:r)?|cu[aá]l\s+es\s+el\s+resultado\s+de|how\s+much\s+is|calculate|solve)\s+[\d\s\+\-\*\/\(\)\.\=\^]+\b/i,
  // Pure arithmetic expressions like "100 + 100", "25*40", "(50 + 20) / 2"
  /^\s*\(?\s*\d+\s*\)?(?:\s*[\+\-\*\/\^]\s*\(?\s*\d+\s*\)?)+\s*(?:=\s*)?\??\s*$/i,
  // Advanced math/algebra requests
  /\b(?:ra[ií]z\s+cuadrada|square\s+root|ecuaci[oó]n\s+cuadr[aá]tica|trigonometr[ií]a|derivada|integral)\b/i
];

/**
 * Code generation, scripting, and software programming patterns.
 * Requires an explicit generation action verb combined with programming terms.
 */
export const CODE_PATTERNS = [
  // "hazme un script en python", "escribe un codigo en c++", "generate a python script"
  /\b(?:haz(?:me)?|escribe(?:me)?|crea(?:me)?|genera(?:me)?|desarrolla(?:me)?|write|create|generate|code)\b[\w\s]{0,25}\b(?:script|c[oó]digo|code|funci[oó]n|function|algoritmo|algorithm|programa|program|software|bot|app|aplicaci[oó]n)\b[\w\s]{0,25}\b(?:en|in|using|con)?\s*\b(?:python|javascript|js|typescript|ts|c\+\+|c\#|java|php|ruby|rust|golang|go|html|css|sql|bash|shell|powershell|c)\b/i,
  // Direct programming language requests: "script en python", "codigo en javascript"
  /\b(?:script|c[oó]digo|code)\s+(?:en|in)\s+(?:python|javascript|js|typescript|ts|c\+\+|c\#|java|php|ruby|rust|golang|go|html|css|sql|bash|powershell)\b/i,
  // Specific code-centric tasks
  /\b(?:crea|haz|desarrolla)\s+(?:un|una)\s+(?:calculadora|pagina\s+web|api|servidor|base\s+de\s+datos)\s+(?:en|con)\s+(?:python|js|node|react|html|css|java|sql)\b/i
];

/**
 * Prompt injection, system prompt leakage, and jailbreak attack patterns.
 */
export const INJECTION_PATTERNS = [
  /\b(?:ignore|olvida|deshazte\s+de)\s+(?:all\s+)?(?:previous|anteriores|todas\s+las)\s+(?:instructions?|instrucciones|reglas|rules)\b/i,
  /\b(?:jailbreak|dan\s+mode|modo\s+dan|developer\s+mode|modo\s+desarrollador)\b/i,
  /\b(?:act[uú]a|pretend\s+to\s+be|roleplay\s+as)\s+(?:como\s+)?(?:un\s+)?(?:ai|ia|asistente)\s+(?:sin\s+restricciones|sin\s+filtros|unfiltered|unrestricted)\b/i,
  /\b(?:show|reveal|display|muestra|revela|dime)\s+(?:your|tu|el)\s+(?:system\s+prompt|prompt\s+del\s+sistema|instrucciones\s+base|reglas\s+internas)\b/i,
  /^\s*system\s*(?:message|prompt)?\s*:\s*/i
];

/**
 * General off-topic and out-of-scope domain divergence patterns.
 * (Medical prescription, cooking recipes, weather, political opinions).
 */
export const OFF_TOPIC_PATTERNS = [
  /\b(?:receta\s+de\s+cocina|receta\s+para\s+cocinar|c[oó]mo\s+preparar|how\s+to\s+cook|recipe\s+for)\b.*\b(?:pasta|arroz|torta|pastel|pollo|carne|sopa|pan)\b/i,
  /\b(?:rec[eé]tame|prescribe\s+me|diagn[oó]stico\s+m[eé]dico|qu[eé]\s+medicamento\s+sirve\s+para|qu[eé]\s+puedo\s+tomar\s+para)\b.*\b(?:dolor|fiebre|infecci[oó]n|enfermedad|s[ií]ntoma)\b/i,
  /\b(?:pron[oó]stico\s+del\s+clima|qu[eé]\s+clima\s+hace|temperatura\s+actual\s+en|weather\s+forecast\s+for)\b/i,
  /\b(?:qui[eé]n\s+va\s+a\s+ganar\s+las\s+elecciones|partido\s+pol[ií]tico|qu[eé]\s+opinas\s+del\s+gobierno)\b/i
];

// ============================================================================
// DETERMINISTIC STANDARD RESPONSES (Admissions Redirection)
// ============================================================================

const STANDARD_SPANISH_REDIRECTION = 
  "Como asistente de admisiones y soporte de Academia de Idiomas Colombia, mi función está orientada exclusivamente a orientarte sobre nuestros programas de idiomas (inglés, francés, alemán, portugués, italiano y español), sedes, horarios y precios en COP.\n\n¿Te gustaría conocer la información de alguno de nuestros cursos o consultar fechas de inicio?";

const STANDARD_ENGLISH_REDIRECTION = 
  "As the admissions and academic support assistant for Colombia Language Academy, my purpose is strictly to assist you with our language programs (English, French, German, Portuguese, Italian, Spanish), class schedules, COP tuition, certifications, and enrollment. Which of our language courses can I help you explore today?";

const SUGGESTED_ACTIONS_ES = [
  "Ver cursos de idiomas",
  "Consultar precios y descuentos",
  "Conocer sedes y horarios"
];

const SUGGESTED_ACTIONS_EN = [
  "View language courses",
  "Check COP pricing & discounts",
  "Campuses & schedules"
];

// ============================================================================
// CORE GUARDRAIL EVALUATOR
// ============================================================================

/**
 * Fast-path local evaluation of incoming user message.
 * Checks for out-of-scope tasks, code writing, math, or prompt injections.
 * 
 * @param {string} rawQuery - The user's input message
 * @returns {{
 *   triggered: boolean,
 *   type: 'MATH' | 'CODE_GENERATION' | 'PROMPT_INJECTION' | 'OFF_TOPIC' | null,
 *   response: object | null
 * }}
 */
export function evaluateLocalGuardrails(rawQuery = '') {
  if (typeof rawQuery !== 'string' || rawQuery.trim().length === 0) {
    return { triggered: false, type: null, response: null };
  }

  const query = rawQuery.trim();

  // 1. Check for whitelist exclusions (e.g., "código de conducta", "código de descuento")
  // If the query is an admissions inquiry containing these legitimate terms, skip code guardrails!
  const hasWhitelistTerm = WHITELIST_EXCLUSIONS.some(pattern => pattern.test(query));

  // Determine user language (heuristic)
  const isEnglish = /\b(?:the|and|how\s+much|what|is|are|course|classes|schedule|price|write|create|solve)\b/i.test(query)
    && !/\b(?:el|la|los|las|de|en|cuanto|precios|cursos|sedes|horarios)\b/i.test(query);

  const replyText = isEnglish ? STANDARD_ENGLISH_REDIRECTION : STANDARD_SPANISH_REDIRECTION;
  const suggestedActions = isEnglish ? SUGGESTED_ACTIONS_EN : SUGGESTED_ACTIONS_ES;

  const buildGuardrailPayload = (guardrailType) => ({
    triggered: true,
    type: guardrailType,
    response: {
      success: true,
      escalate: false,
      ticketId: null,
      reason: null,
      reply: replyText,
      lead_info: null,
      suggested_actions: suggestedActions,
      sources: [],
      cached: true,
      latencyMs: 1,
      tier: 'TIER_0_LOCAL_GUARDRAIL',
      modelUsed: 'local-guardrail-engine',
      guardrailType
    }
  });

  // 2. Math & Arithmetic Check
  for (const pattern of MATH_PATTERNS) {
    if (pattern.test(query)) {
      return buildGuardrailPayload('MATH');
    }
  }

  // 3. Prompt Injection & Jailbreak Check
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(query)) {
      return buildGuardrailPayload('PROMPT_INJECTION');
    }
  }

  // 4. Code Generation Check (Only if not explicitly whitelisted, e.g. "código de conducta")
  if (!hasWhitelistTerm) {
    for (const pattern of CODE_PATTERNS) {
      if (pattern.test(query)) {
        return buildGuardrailPayload('CODE_GENERATION');
      }
    }
  }

  // 5. General Off-Topic Check
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(query)) {
      return buildGuardrailPayload('OFF_TOPIC');
    }
  }

  return {
    triggered: false,
    type: null,
    response: null
  };
}
