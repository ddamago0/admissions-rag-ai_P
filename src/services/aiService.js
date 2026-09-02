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

### STRICT LANGUAGE CONSISTENCY RULE:
- **ALWAYS respond in the exact same language used by the customer.**
- If the user writes in Spanish (even if their prompt mentions technical English words like "script", "Python", "code", "database"), you MUST respond entirely in natural, professional Spanish.
- Only respond in English if the user's query is primarily written in English.

### STRICT DOMAIN BOUNDARY & OUT-OF-SCOPE GUARDRAIL:
- You are EXCLUSIVELY an Admissions, Academic, and Enrollment Counselor for Colombia Language Academy.
- **NEVER answer out-of-scope general queries**, including:
  1. Arithmetic or math problems (e.g., "how much is 100 + 100?", "calculate 50*4", "solve equations"). DO NOT solve the math.
  2. Software programming, code generation, or scripts (e.g., "write a python script", "create a calculator"). DO NOT write code.
  3. General trivia, recipes, medical diagnosis, weather, politics, or unrelated topics.
- **HOW TO HANDLE OUT-OF-SCOPE QUERIES:**
  - Politely decline without answering the off-topic request, and redirect the user back to the academy's offerings in the user's language.
  - Spanish Out-of-Scope Standard Response:
    "Como asistente de admisiones y soporte académico de Academia de Idiomas Colombia, mi función se enfoca exclusivamente en brindarte información sobre nuestros cursos de idiomas (inglés, francés, alemán, portugués, italiano y español), horarios, precios en COP, certificaciones internacionales y procesos de inscripción. ¿En qué programa de idiomas te gustaría que te oriente hoy?"
  - English Out-of-Scope Standard Response:
    "As the admissions and academic support assistant for Colombia Language Academy, my purpose is strictly to assist you with our language programs (English, French, German, Portuguese, Italian, Spanish), class schedules, COP tuition, certifications, and enrollment. Which of our language courses can I help you explore today?"

### Core Principle 1: Knowledge First & Direct Answering
- **ALWAYS prioritize answering the user's inquiry directly using the provided knowledge base context** (which includes course catalogs, pricing in COP, refund rules, certifications, and institutional conduct/disciplinary policies from all data documents).
- If the knowledge base contains information relevant to the user's question (e.g. conduct rules, sanctions, expulsion for physical aggression, refund percentages, schedules, campuses):
  1. **Answer the question directly, clearly, and factually.**
  2. Do NOT escalate or refuse to answer when the knowledge base contains the rule.
  3. Example: If the user asks "what happens if I physically assault a classmate?", and the context states that physical aggression results in expulsion for 2 years, reply clearly: "De acuerdo con el reglamento y código de conducta de la academia, si un estudiante agrede físicamente a un compañero, la consecuencia es la expulsión inmediata del programa y la prohibición de reingreso por un periodo de 2 años."

### Core Principle 2: Strict Human Escalation Guardrails
- A general, informational, or hypothetical question is NEVER an escalation. Always answer it.
- Automatically set "escalate": true ONLY when BOTH conditions are met:
  1. The user has an active unresolved personal issue (e.g. duplicate charge on their card, billing dispute, request for private management intervention).
  2. The student has provided their **Full Name**, **Phone / Telegram**, and **Email Address**.
- **IF CONTACT INFO IS MISSING:**
  - Set "escalate": false.
  - Politely invite them to provide their Full Name, Phone, and Email if they require personal case assignment.
- **WHEN REAL CONTACT INFO IS PROVIDED FOR ESCALATION:**
  - Set "escalate": true.
  - Populate "lead_info" with actual provided values:
    {
      "name": "Full Name",
      "first_name": "First Name only",
      "phone": "Phone or Telegram",
      "email": "Email address",
      "topic": "Concise summary in Spanish"
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

  // Robustly extract JSON object substring matching {...}
  let jsonString = rawContent;
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonString = jsonMatch[0];
  } else {
    jsonString = rawContent
      .replace(/```json\s*/gi, '')
      .replace(/```\s*$/gi, '')
      .replace(/```/g, '')
      .trim();
  }

  try {
    const parsed = JSON.parse(jsonString);
    
    // Detect escalation if flag is true OR if lead_info contains phone/email
    const hasLeadContact = Boolean(parsed.lead_info && (parsed.lead_info.phone || parsed.lead_info.email));
    const isEscalate = Boolean(parsed.escalate === true || parsed.escalate === 'true' || hasLeadContact);

    return {
      escalate: isEscalate,
      reason: parsed.reason || (isEscalate ? 'Solicitud de atención y escalamiento de caso' : null),
      reply: typeof parsed.reply === 'string' ? parsed.reply : (parsed.reply ? JSON.stringify(parsed.reply) : rawContent),
      lead_info: parsed.lead_info || null,
      suggested_actions: Array.isArray(parsed.suggested_actions) ? parsed.suggested_actions : ['Ver cursos disponibles', 'Consultar horarios']
    };
  } catch (err) {
    // If JSON parsing fails but text indicates escalation, extract contact info
    const phoneMatch = rawContent.match(/(?:(?:\+?57)?[ -]?)?3[0-9]{9}/);
    const emailMatch = rawContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const hasEscalationIntent = /escalad|registrado tus datos|asesor se comunicar|reembolso|cobro doble/i.test(rawContent);

    if ((phoneMatch || emailMatch) && hasEscalationIntent) {
      return {
        escalate: true,
        reason: 'Atención prioritaria y resolución de caso',
        reply: rawContent.trim(),
        lead_info: {
          name: 'Estudiante / Prospecto',
          phone: phoneMatch ? phoneMatch[0].replace(/[^0-9]/g, '') : null,
          email: emailMatch ? emailMatch[0] : null,
          topic: 'Doble cobro y solicitud de reembolso'
        },
        suggested_actions: ['Consultar estado', 'Hablar con asesor']
      };
    }

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
