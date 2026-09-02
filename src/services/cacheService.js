/**
 * Instant Knowledge & FAQ Cache Service
 * Provides lightning-fast (< 5ms) answers for frequent institutional questions
 * to conserve Gemini API quota, eliminate rate limits, and maximize throughput.
 */

// In-memory dynamic response cache
const dynamicCache = new Map();
const MAX_CACHE_ENTRIES = 200;

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
 * Pre-compiled Instant FAQ Knowledge Base
 */
const PRELOADED_FAQ_PATTERNS = [
  {
    patterns: [
      /horario|sedes?|bogota|medellin|modalidad/i
    ],
    requiredTerms: ['horario', 'sede'],
    data: {
      reply: 'En Academia de Idiomas Colombia ofrecemos modalidades presenciales y virtuales con horarios flexibles:\n\n📍 **Sedes Presenciales:**\n- **Bogotá:** Calle 72 (Chapinero) y Carrera 7 # 120-20 (Usaquén).\n- **Medellín:** El Poblado (Carrera 43A) y Laureles (Avenida Nutibara).\n\n⏱️ **Modalidades de Estudio:**\n1. **Estándar (Lunes a Jueves - 8h/sem):** Mañana (7:00 AM – 9:00 AM), Mediodía (12:00 PM – 2:00 PM), Noche (6:30 PM – 8:30 PM).\n2. **Súper Intensivo (Lunes a Viernes - 15h/sem):** 8:00 AM – 11:00 AM o 6:00 PM – 9:00 PM.\n3. **Sábados Intensivo (5h/sem):** 8:00 AM – 1:00 PM o 1:30 PM – 6:30 PM.\n4. **100% Virtual en Vivo:** Clases en tiempo real con docentes nativos/bilingües.\n\n¿Deseas información sobre algún idioma en específico?',
      sources: ['courses_and_levels.md', 'pricing_and_enrollment.md'],
      suggested_actions: ['Consultar precios', 'Ver cursos de inglés', 'Métodos de pago']
    }
  },
  {
    patterns: [
      /precio|costo|cuanto cuesta|valor|tarifas?|matricula/i
    ],
    requiredTerms: ['precio', 'costo', 'valor'],
    data: {
      reply: 'Las tarifas oficiales para nuestros programas de idiomas en pesos colombianos (COP) son:\n\n💰 **Precios por Módulo (40 horas):**\n- **Modalidad Estándar:** $480,000 COP por módulo (5 semanas).\n- **Súper Intensivo:** $690,000 COP por módulo (2.5 semanas).\n- **Sábados Intensivo:** $350,000 COP por mes (20 horas/mes).\n\n🏷️ **Descuentos Especiales:**\n- **10% de descuento:** Al pagar 3 módulos por adelantado.\n- **15% de descuento:** Al matricular un nivel CEFR completo (ej. B1 o B2 completo).\n- **Matrícula inicial:** $80,000 COP (pago único nuevos estudiantes).\n- **Material y plataforma digital:** $120,000 COP (cubre 2 sub-niveles).\n\n¿Te gustaría calcular el costo total de algún programa o conocer los medios de pago?',
      sources: ['pricing_and_enrollment.md'],
      suggested_actions: ['Descuentos disponibles', 'Pagar con PSE o Addi', 'Horarios de clase']
    }
  },
  {
    patterns: [
      /^(?:hay|tienen|que|cuales son los|existen)?\s*(?:descuentos?|promociones?|rebajas?|ofertas?)\s*(?:\?|$)/i,
      /descuento por pronto pago|descuento por nivel completo|promocion por pago/i
    ],
    requiredTerms: ['descuento'],
    data: {
      reply: 'Contamos con dos programas de descuento por pronto pago:\n\n✨ **1. Descuento del 10%:** Aplica al cancelar 3 módulos académicos en un solo pago por adelantado.\n✨ **2. Descuento del 15%:** Aplica al matricular un nivel completo del Marco Común Europeo (CEFR), por ejemplo todo el nivel B1 o todo el B2.\n\nAdicionalmente, si realizas tu matrícula en las jornadas de inscripción anticipada, el examen de nivelación ($50,000 COP) es 100% gratuito.\n\n¿Deseas que te orientemos sobre algún nivel en particular?',
      sources: ['pricing_and_enrollment.md'],
      suggested_actions: ['Ver precios de cursos', 'Métodos de pago', 'Examen de nivelación']
    }
  },
  {
    patterns: [
      /pago|pse|addi|tarjeta|bancolombia|financiar|cuotas/i
    ],
    requiredTerms: ['pago', 'pse', 'addi'],
    data: {
      reply: 'Aceptamos múltiples canales de pago seguros y opciones de financiamiento:\n\n💳 **Medios de Pago Directos:**\n- **PSE:** Pagos electrónicos desde cualquier banco o cooperativa de Colombia.\n- **Bancolombia:** Transferencias y código QR institucional.\n- **Tarjetas de Crédito/Débito:** Visa, Mastercard, American Express.\n\n⚡ **Financiamiento a Cuotas sin Interés:**\n- **Addi:** Paga en hasta 3 cuotas con **0% de interés** y aprobación 100% digital en 2 minutos.\n- **Sistecrédito:** Crédito educativo para cuotas mensuales.\n\n¿Requieres asistencia con tu proceso de pago o enlace de PSE?',
      sources: ['pricing_and_enrollment.md'],
      suggested_actions: ['Ver precios de cursos', 'Políticas de reembolso', 'Horarios de clase']
    }
  },
  {
    patterns: [
      /ielts|toefl|delf|goethe|certificacion|internacional/i
    ],
    requiredTerms: ['ielts', 'toefl', 'delf', 'goethe', 'certificacion'],
    data: {
      reply: 'Ofrecemos cursos especializados de preparación para exámenes internacionales oficiales con un **98.4% de tasa de aprobación**:\n\n🎓 **Certificaciones Disponibles:**\n- **Inglés:** IELTS (Academic & General Training) y TOEFL iBT.\n- **Francés:** DELF (A1–B2) y DALF (C1).\n- **Alemán:** Goethe-Zertifikat (A1–B2) y TestDaF.\n- **Portugués:** CELPE-Bras.\n- **Español:** DELE y SIELE.\n\n📋 **Estructura del Programa:**\n- Duración: 40 horas de entrenamiento intensivo.\n- Incluye **3 simulacros reales por computador** y retroalimentación personalizada de Speaking y Writing.\n- Calificación mínima institucional de aprobación: **75/100 puntos**.\n\n¿Para qué examen o fecha específica te estás preparando?',
      sources: ['certifications_and_policies.md', 'courses_and_levels.md'],
      suggested_actions: ['Precios de preparación', 'Horarios de simulacros', 'Inscribirme a IELTS']
    }
  },
  {
    patterns: [
      /que programas|que cursos|que idiomas|cuales idiomas|oferta academica/i
    ],
    requiredTerms: ['programa', 'curso', 'idioma'],
    data: {
      reply: 'En Academia de Idiomas Colombia impartimos formación en **6 idiomas globales** bajo el Marco Común Europeo de Referencia (CEFR A1–C1):\n\n1. 🇬🇧/🇺🇸 **Inglés:** General, Business English, Kids & Teens y preparación IELTS/TOEFL.\n2. 🇫🇷 **Francés:** Conversacional, académico y preparación DELF/DALF.\n3. 🇩🇪 **Alemán:** Cursos para estudios universitarios, ingenierías y visas de trabajo (Goethe/TestDaF).\n4. 🇧🇷 **Portugués:** Inmersión en portugués de Brasil y CELPE-Bras.\n5. 🇮🇹 **Italiano:** Italiano conversacional e integración cultural (CILS).\n6. 🇨🇴 **Español para Extranjeros:** Inmersión para expatriados y nómadas digitales.\n\n¿Sobre cuál de estos idiomas te gustaría recibir información de horarios y tarifas?',
      sources: ['courses_and_levels.md'],
      suggested_actions: ['Ver precios de cursos', 'Horarios y sedes', 'Descuentos disponibles']
    }
  },
  {
    patterns: [
      /reembolso|devolucion|cancelar matricula/i
    ],
    requiredTerms: ['reembolso', 'devolucion'],
    data: {
      reply: 'Nuestra política oficial de cancelaciones y reembolsos establece:\n\n📋 **Condiciones de Reembolso:**\n- **100% de reembolso** (descontando el 10% por costos administrativos y financieros) si la solicitud se radica por escrito con al menos **3 días hábiles de anticipación** a la fecha de inicio del curso.\n- Una vez iniciado el módulo o transcurrido el plazo inicial, no se efectúan devoluciones en dinero, pero el saldo puede ser congelado o transferido como bono educativo para futuros periodos.\n\n¿Requieres orientación con algún trámite académico o administrativo?',
      sources: ['pricing_and_enrollment.md', 'certifications_and_policies.md'],
      suggested_actions: ['Hablar con un asesor', 'Consultar formas de pago', 'Ver cursos disponibles']
    }
  }
];

/**
 * Checks for an instant pre-loaded FAQ match.
 * @param {string} rawQuery
 * @returns {object|null}
 */
export function getPreloadedFaqResponse(rawQuery = '') {
  const normalized = normalizeQuery(rawQuery);
  if (normalized.length < 5) return null;

  // Don't use static FAQ cache if user expresses an urgent private issue, lead info, or specific document topics
  if (/peleo|agrede|conflicto|problema|doble cobro|queja|30[0-9]{8}|@|beca|deport|convenio|especial|personalizad|reglamento|conducta|sancion|expulsi/i.test(rawQuery)) {
    return null;
  }

  for (const faq of PRELOADED_FAQ_PATTERNS) {
    const hasPattern = faq.patterns.some(p => p.test(rawQuery) || p.test(normalized));
    const hasRequired = faq.requiredTerms.some(term => normalized.includes(term));
    if (hasPattern && hasRequired) {
      return {
        success: true,
        escalate: false,
        ticketId: null,
        reason: null,
        reply: faq.data.reply,
        lead_info: null,
        suggested_actions: faq.data.suggested_actions,
        sources: faq.data.sources,
        cached: true,
        latencyMs: 3
      };
    }
  }

  return null;
}

/**
 * Checks the dynamic response cache.
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
      latencyMs: 2
    };
  }
  return null;
}

/**
 * Saves a response in the dynamic cache.
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
 * Clears all dynamic caches (e.g. when knowledge base is re-indexed).
 */
export function flushDynamicCache() {
  dynamicCache.clear();
}
