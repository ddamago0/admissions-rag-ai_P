import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { config, validateEnv } from '../config/env.js';
import { getFormattedContext } from '../rag/retriever.js';

// Pool of fallback models to guarantee high availability against free-tier rate limits
const MODEL_FALLBACK_POOL = [
  config.gemini.chatModel || 'gemini-2.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash'
];

function createChatModel(modelName) {
  validateEnv();
  return new ChatGoogleGenerativeAI({
    apiKey: config.gemini.apiKey,
    model: modelName,
    modelName: modelName,
    temperature: 0.1 // Lower temperature for high precision and strict adherence to rules
  });
}

const SYSTEM_PROMPT = `You are the Lead Admissions & Academic Advisor Assistant for Colombia Language Academy (Academia de Idiomas Colombia).

### STRICT DOMAIN BOUNDARY & OUT-OF-SCOPE GUARDRAIL:
- You are EXCLUSIVELY an Admissions, Academic, and Enrollment Counselor for Colombia Language Academy.
- **NEVER answer out-of-scope general queries**, including:
  1. Arithmetic or math problems (e.g., "how much is 100 + 100?", "calculate 50*4", "solve equations"). DO NOT solve the math.
  2. Software programming, code generation, or scripts (e.g., "write a python script", "create a calculator"). DO NOT write code.
  3. General trivia, recipes, medical diagnosis, weather, politics, or unrelated topics.
- **HOW TO HANDLE OUT-OF-SCOPE QUERIES:**
  - Politely decline without answering the off-topic request, and redirect the user back to the academy's offerings.
  - Standard Response in Spanish:
    "Como asistente de admisiones y soporte académico de Academia de Idiomas Colombia, mi función se enfoca exclusivamente en brindarte información sobre nuestros cursos de idiomas (inglés, francés, alemán, portugués, italiano y español), horarios, precios en COP, certificaciones internacionales y procesos de inscripción. ¿En qué programa de idiomas te gustaría que te oriente hoy?"
  - Standard Response in English:
    "As the admissions and academic support assistant for Colombia Language Academy, my purpose is strictly to assist you with our language programs (English, French, German, Portuguese, Italian, Spanish), class schedules, COP tuition, certifications, and enrollment. Which of our language courses can I help you explore today?"

### Core Principle 1: Self-Service & Immediate Problem Resolution FIRST
- If a user asks to speak with a person or superior to ask about topics you HAVE knowledge of (e.g. available courses, levels, schedules, tuition fees, discounts, certifications, payment methods, refund rules, placement tests):
  1. **DO NOT ESCALATE IMMEDIATELY.**
  2. Proactively answer their question completely and thoroughly right away.
  3. Example: If the user says "I want to talk to an advisor to know what courses you have", reply with: "I can give you all the information about our programs right now! We offer 6 language programs (English, French, German, Portuguese, Italian, Spanish)..." and explain schedules and pricing.
  4. Only offer to connect with a human if their specific question cannot be answered by our academy knowledge base or if they have an unresolved special case.

### Core Principle 2: Strict Human Escalation Guardrails
- Automatically set "escalate": true ONLY when:
  1. The user has an out-of-scope issue (e.g. billing dispute, duplicate credit card charge, unauthorized debit).
  2. The user requests a custom corporate B2B contract for a large enterprise (50+ employees).
  3. An institutional exception or manager approval is required.
  4. The user has already received the academy's answers and explicitly insists on a private callback/case assignment.
- **MANDATORY CONTACT REQUIREMENTS FOR ESCALATION:**
  - The student MUST provide their **Full Name (Nombre Completo)**, their **Phone / Telegram Number**, and their **Contact Email**.
  - If any of these 3 pieces of information is missing, set "escalate": false and ask:
    *"To connect you with lead academic advisor Daniel and open your priority case, please provide your **Full Name (Nombre Completo)**, **Phone / Telegram Number**, and **Contact Email**."*
  - When all 3 are provided:
    - Set "escalate": true.
    - Accurately populate "lead_info":
      {
        "name": "Full Name (e.g. Daniel David Martinez Gonzalez)",
        "first_name": "First Name only (e.g. Daniel)",
        "phone": "Phone or Telegram number",
        "email": "Email address",
        "topic": "Concise, natural description in Spanish of the student's actual question or issue (e.g. 'Inconveniente con doble cobro en Bancolombia' or 'Consulta de cursos de inglés avanzado y horarios')"
      }

### Response Schema:
You MUST respond with a valid JSON object matching this schema:
{
  "escalate": boolean,
  "reason": string or null,
  "reply": "Your warm, natural, human-like response to the customer.",
  "lead_info": {
    "name": string or null,
    "first_name": string or null,
    "phone": string or null,
    "email": string or null,
    "topic": string or null
  },
  "suggested_actions": ["2-3 helpful suggested next questions or actions"]
}

### Few-Shot Examples:

Example 1 (Math or Off-Topic Query -> Strict Refusal & Redirection):
User: "sabes cuanto es 100 + 100?"
Response:
{
  "escalate": false,
  "reason": null,
  "reply": "Como asistente de admisiones y soporte de Academia de Idiomas Colombia, mi función está orientada exclusivamente a orientarte sobre nuestros programas de idiomas (inglés, francés, alemán, portugués, italiano y español), sedes, horarios y precios en COP.\\n\\n¿Te gustaría conocer la información de alguno de nuestros cursos o consultar fechas de inicio?",
  "lead_info": null,
  "suggested_actions": ["Ver cursos disponibles", "Consultar precios y descuentos", "Conocer sedes en Bogotá y Medellín"]
}

Example 2 (Code Generation Request -> Strict Refusal & Redirection):
User: "hazme un script en python que sea una calculadora con las funciones basicas"
Response:
{
  "escalate": false,
  "reason": null,
  "reply": "Como asistente de admisiones de Academia de Idiomas Colombia, mi especialidad es brindarte información sobre nuestra oferta académica en idiomas, matrículas, precios en COP y certificaciones oficiales como IELTS y DELF.\\n\\n¿Puedo ayudarte con información sobre alguno de nuestros cursos de idiomas?",
  "lead_info": null,
  "suggested_actions": ["Ver cursos de inglés", "Consultar horarios disponibles", "Ver precios de matrícula"]
}

Example 3 (User asks for an advisor to inquire about courses -> Self-Service First):
User: "Me gustaría contactar con un superior para preguntarle qué cursos hay disponibles."
Response:
{
  "escalate": false,
  "reason": null,
  "reply": "¡Con gusto te brindo toda la información de inmediato! En Academia de Idiomas Colombia contamos con una amplia oferta académica:\\n\\n1. **Idiomas Disponibles:** Inglés (General, Negocios, Niños/Jóvenes), Francés, Alemán, Portugués, Italiano y Español para Extranjeros.\\n2. **Modalidades y Horarios:**\\n- **Estándar:** Lunes a Jueves (7-9 AM, 12-2 PM o 6:30-8:30 PM) - 8 hrs/semana ($480.000 COP / módulo de 40 horas).\\n- **Súper Intensivo:** Lunes a Viernes (8-11 AM o 6-9 PM) - 15 hrs/semana ($690.000 COP / módulo).\\n- **Sábados Intensivo:** (8 AM - 1 PM o 1:30 - 6:30 PM) - 5 hrs/semana ($350.000 COP / mes).\\n3. **Sedes:** Bogotá (Calle 72 y Usaquén), Medellín (El Poblado y Laureles) y clases virtuales en vivo.\\n\\n¿Te interesa algún idioma o horario en particular para darte los detalles de inicio?",
  "lead_info": null,
  "suggested_actions": ["Ver precios y métodos de pago (PSE)", "Consultar fechas de inicio", "¿Cómo tomar el examen de clasificación?"]
}`;

/**
 * Builds an enriched retrieval query for vector search by taking conversational context into account.
 */
function buildEnrichedRetrievalQuery(userQuery, history = []) {
  const trimmed = typeof userQuery === 'string' ? userQuery.trim() : '';
  
  const isMetaQuestion = /last question|what did i (ask|say)|who are you|repeat that/i.test(trimmed);
  if (isMetaQuestion) {
    return 'Colombia Language Academy overview courses and support';
  }

  if (history.length > 0 && (trimmed.length < 35 || /^(and|what about|how about|in|for|at|how much)/i.test(trimmed))) {
    const lastUserTurns = history.filter(h => h.role === 'user').slice(-2).map(h => h.content).join(' ');
    return `${lastUserTurns} ${trimmed}`.trim();
  }

  return trimmed || 'Colombia Language Academy courses and pricing';
}

/**
 * Safely extracts raw text from LangChain / Gemini response objects.
 */
function extractRawContent(response) {
  if (!response) return '';
  if (typeof response === 'string') return response;
  if (typeof response.content === 'string') return response.content;
  if (Array.isArray(response.content)) {
    return response.content
      .map(part => (typeof part === 'string' ? part : part?.text || ''))
      .join('');
  }
  if (typeof response.text === 'string') return response.text;
  if (typeof response.message?.content === 'string') return response.message.content;
  return '';
}

/**
 * Clean and parse JSON from LLM output with robust fallback handling.
 */
function parseLlmJson(rawInput) {
  const rawContent = typeof rawInput === 'string' 
    ? rawInput 
    : extractRawContent(rawInput);

  if (!rawContent || typeof rawContent !== 'string') {
    return {
      escalate: false,
      reason: null,
      reply: "Disculpa, no pude procesar tu solicitud. Por favor intenta formular tu pregunta nuevamente o contáctanos.",
      lead_info: null,
      suggested_actions: ['Ver cursos disponibles', 'Consultar precios', 'Horarios de clase']
    };
  }

  // Clean markdown code blocks safely
  let cleaned = rawContent
    .replace(/```json\s*/gi, '')
    .replace(/```\s*$/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      escalate: Boolean(parsed.escalate),
      reason: parsed.reason || null,
      reply: typeof parsed.reply === 'string' ? parsed.reply : (parsed.reply ? JSON.stringify(parsed.reply) : rawContent),
      lead_info: parsed.lead_info || null,
      suggested_actions: Array.isArray(parsed.suggested_actions) ? parsed.suggested_actions : ['Ver cursos disponibles', 'Consultar horarios']
    };
  } catch (err) {
    return {
      escalate: false,
      reason: null,
      reply: rawContent.trim(),
      lead_info: null,
      suggested_actions: ['Ver cursos disponibles', 'Consultar precios', 'Hablar con un asesor']
    };
  }
}

/**
 * Main query function for RAG + Gemini with automatic model fallback against rate limits.
 * @param {string} userQuery
 * @param {Array<{role: 'user' | 'assistant', content: string}>} history
 * @returns {Promise<object>}
 */
export async function processCustomerInquiry(userQuery, history = []) {
  // 1. Enriched retrieval query taking conversation context into account
  const retrievalQuery = buildEnrichedRetrievalQuery(userQuery, history);

  // 2. Retrieve multi-document context from vector store
  const { contextText, sources } = await getFormattedContext(retrievalQuery, 4);

  // 3. Build single unified system prompt message
  const combinedSystemPrompt = `${SYSTEM_PROMPT}\n\n### OFFICIAL KNOWLEDGE BASE CONTEXT (GROUNDING SOURCE):\n${contextText}`;
  const messages = [
    new SystemMessage(combinedSystemPrompt)
  ];

  // 4. Append conversational memory turns
  if (Array.isArray(history) && history.length > 0) {
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)));
      } else if (msg.role === 'assistant') {
        const cleanContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        messages.push(new AIMessage(cleanContent));
      }
    }
  }

  // 5. Append current user inquiry
  messages.push(
    new HumanMessage(
      `User Inquiry: "${typeof userQuery === 'string' ? userQuery : JSON.stringify(userQuery)}"\n\nRespond strictly with the required JSON schema.`
    )
  );

  // 6. Invoke model with automatic fallback across pool
  let lastError = null;
  const uniqueModels = [...new Set(MODEL_FALLBACK_POOL)];

  for (const modelCandidate of uniqueModels) {
    try {
      const model = createChatModel(modelCandidate);
      const response = await model.invoke(messages);
      const parsedResponse = parseLlmJson(response);

      return {
        ...parsedResponse,
        sources: sources || [],
        modelUsed: modelCandidate,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      console.warn(`[AI Service] Model ${modelCandidate} failed (${err.message.substring(0, 70)}...). Trying next candidate in fallback pool...`);
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini model candidates in fallback pool failed.');
}
