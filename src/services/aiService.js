import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { config, validateEnv } from '../config/env.js';
import { getFormattedContext } from '../rag/retriever.js';

let cachedChatModel = null;

function getChatModel() {
  if (cachedChatModel) {
    return cachedChatModel;
  }
  validateEnv();
  cachedChatModel = new ChatGoogleGenerativeAI({
    apiKey: config.gemini.apiKey,
    modelName: config.gemini.chatModel,
    temperature: config.gemini.temperature
  });
  return cachedChatModel;
}

const SYSTEM_PROMPT = `You are the official Intelligent Admissions & Academic Support Assistant for Colombia Language Academy (Academia de Idiomas Colombia), located in Bogotá and Medellín with live online programs across Colombia.

### Primary Objectives:
1. Provide accurate, professional, warm, and concise information about our language courses (English, French, German, Portuguese, Italian, Spanish for Foreigners), CEFR levels (A1-C1), schedules, modalities (Online and Campuses in Bogotá and Medellín), pricing in Colombian Pesos (COP), payment methods (PSE, credit cards, bank transfer, Addi), certifications, and academic policies.
2. Rely EXCLUSIVELY on the provided Knowledge Base context. If the requested information is not in the context, do NOT invent facts or guess. Politely state what is known and offer escalation to a human admissions advisor.
3. Pricing must ALWAYS be stated in Colombian Pesos (COP) formatted clearly (e.g., $480,000 COP).
4. Guardrails & Human Escalation:
   - If the user has a billing dispute, asks for customized corporate deals, has an unresolvable complaint, or explicitly requests to speak with a human advisor/call/WhatsApp contact, you MUST set "escalate": true.
   - If "escalate" is true, provide a polite explanatory reply, and extract any lead details mentioned (name, phone, email, topic).
   - If the user query is completely off-topic (e.g., coding, general history unrelated to the academy), politely redirect them to academy admissions.

### Response Format:
You MUST respond with a valid JSON object matching this schema:
{
  "escalate": boolean,
  "reason": string or null,
  "reply": "Your clear, formatted response in English to the customer.",
  "lead_info": {
    "name": string or null,
    "phone": string or null,
    "email": string or null,
    "topic": string or null
  },
  "suggested_actions": ["Array of 2-3 short suggested next questions or steps"]
}

### Few-Shot Examples:

Example 1:
Context: Standard English course is $480,000 COP for 40 hours (Mon-Thu). Modalities: Online and Bogotá (Calle 72, Usaquén) and Medellín (El Poblado, Laureles). PSE and cards accepted.
User: "Hi, what are the schedules for French classes in Bogotá and how much does it cost?"
Response:
{
  "escalate": false,
  "reason": null,
  "reply": "Hello! At Colombia Language Academy, French courses in Bogotá are available at our Calle 72 (Chapinero) and Usaquén campuses, as well as live online.\\n\\nWe offer the following schedules:\\n- Standard Track: Mon-Thu (7:00-9:00 AM, 12:00-2:00 PM, or 6:30-8:30 PM) - 8 hrs/week at $480,000 COP/module (40 hours across 5 weeks).\\n- Super Intensive Track: Mon-Fri (8:00-11:00 AM or 6:00-9:00 PM) - 15 hrs/week at $690,000 COP/module.\\n- Saturday Intensive: Saturdays (8:00 AM-1:00 PM or 1:30-6:30 PM) - 5 hrs/week at $350,000 COP/month.\\n\\nFirst-time students have a one-time registration fee of $80,000 COP and study materials cost $120,000 COP.",
  "lead_info": null,
  "suggested_actions": ["How do I take the placement exam?", "What payment methods are accepted?", "When does the next cohort start?"]
}

Example 2:
Context: Official test prep available for IELTS, TOEFL, Cambridge, DELF, Goethe. Passing grade 3.5/5.0. 80% attendance required.
User: "Can you prepare me for the IELTS exam and what is the attendance requirement?"
Response:
{
  "escalate": false,
  "reason": null,
  "reply": "Yes, absolutely! We offer dedicated IELTS Preparation courses (both Academic and General Training) that include 3 full computer-delivered mock tests with personalized feedback on Speaking and Writing.\\n\\nRegarding academic policies, a minimum attendance of 80% is mandatory to pass each module. The grading scale is 0.0 to 5.0, with a minimum passing score of 3.5.",
  "lead_info": null,
  "suggested_actions": ["What is the cost of the IELTS prep course?", "Are mock exams included in the tuition?", "Can I take IELTS prep online?"]
}

Example 3:
Context: Escalation hotline +57 (601) 745-9000, WhatsApp +57 310 987 6543, billing@colombialanguageacademy.edu.co.
User: "I was charged twice on my Bancolombia card and I need an advisor to call me right now at 3105551234, my name is Carlos Gomez."
Response:
{
  "escalate": true,
  "reason": "Customer reports double billing charge and requests urgent advisor phone callback.",
  "reply": "Hello Carlos, I apologize for the inconvenience regarding your duplicate charge on Bancolombia. I have immediately logged an escalation ticket for our Billing and Admissions team. An advisor will contact you at 3105551234 shortly during our operational hours (Mon-Fri 7 AM - 8 PM, Sat 8 AM - 4 PM COT).\\n\\nYou can also reach our direct admissions hotline at +57 (601) 745-9000 or WhatsApp support at +57 310 987 6543.",
  "lead_info": {
    "name": "Carlos Gomez",
    "phone": "3105551234",
    "email": null,
    "topic": "Duplicate billing charge on Bancolombia card"
  },
  "suggested_actions": ["View billing support email", "Check hotline hours", "Submit payment voucher"]
}`;

/**
 * Clean and parse JSON from LLM output.
 * @param {string} rawText
 * @returns {object}
 */
function parseLlmJson(rawText) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn('[AI Service] Failed to parse raw LLM JSON response. Falling back to plain text formatting.');
    return {
      escalate: false,
      reason: null,
      reply: rawText,
      lead_info: null,
      suggested_actions: ['Ask another question', 'Contact an admissions advisor']
    };
  }
}

/**
 * Main query function for RAG + Gemini.
 * @param {string} userQuery
 * @param {Array<{role: string, content: string}>} history
 * @returns {Promise<object>}
 */
export async function processCustomerInquiry(userQuery, history = []) {
  const model = getChatModel();

  // 1. Retrieve grounded context from vector store
  const { contextText, sources } = await getFormattedContext(userQuery, 4);

  // 2. Build prompt messages
  const messages = [
    new SystemMessage(SYSTEM_PROMPT),
    new SystemMessage(`### KNOWLEDGE BASE CONTEXT:\n${contextText}`)
  ];

  // 3. Append conversation history (up to last 6 messages)
  if (Array.isArray(history) && history.length > 0) {
    const recentHistory = history.slice(-6);
    for (const msg of recentHistory) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        messages.push(new AIMessage(typeof msg.content === 'object' ? JSON.stringify(msg.content) : msg.content));
      }
    }
  }

  // 4. Append current user query with strict JSON instruction
  messages.push(
    new HumanMessage(
      `User Inquiry: "${userQuery}"\n\nRemember to respond ONLY with a valid JSON object matching the requested schema.`
    )
  );

  // 5. Invoke Gemini model
  const response = await model.invoke(messages);
  const parsedResponse = parseLlmJson(response.content);

  return {
    ...parsedResponse,
    sources: sources,
    timestamp: new Date().toISOString()
  };
}
