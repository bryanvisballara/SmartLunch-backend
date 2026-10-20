const { OpenAI } = require('openai');

const openAiClient = String(process.env.OPENAI_API_KEY || '').trim()
  ? new OpenAI({ apiKey: String(process.env.OPENAI_API_KEY || '').trim() })
  : null;

const AREA_IDS = ['communications', 'billing', 'academics', 'store', 'wellbeing'];

const AREA_LABELS = {
  communications: 'Comunicaciones',
  billing: 'Cartera',
  academics: 'Academia',
  store: 'Tienda escolar',
  wellbeing: 'Enfermería y bienestar',
};

function normalizeText(value) {
  return String(value || '').trim();
}

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.max(18, Math.min(94, Math.round(numeric)));
}

function buildQuestionnaireBlock(questionnaire = []) {
  return (Array.isArray(questionnaire) ? questionnaire : [])
    .map((item, index) => {
      const selected = (Array.isArray(item.selectedLabels) ? item.selectedLabels : []).join('; ') || '(sin opción marcada)';
      const other = normalizeText(item.otherText);
      return [
        `${index + 1}. ${normalizeText(item.prompt) || item.id}`,
        `   Área: ${AREA_LABELS[item.areaId] || item.areaId || 'General'}`,
        `   Respuestas marcadas: ${selected}`,
        other ? `   Otro (texto libre): ${other}` : '',
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

function buildAnalyzePrompt({ schoolName, note, questionnaire, localReport }) {
  const localOverall = localReport?.overall;
  return [
    'Eres un consultor de Comergio, plataforma escolar en Colombia (comunicaciones con familias, cartera, academia, tienda/cafetería, enfermería).',
    'Vas a leer las respuestas de un colegio y devolver una lectura respetuosa para rectoría o propietarios.',
    'Reglas de tono:',
    '- Nunca culpes al colegio ni uses lenguaje de auditoría o reproche.',
    '- Reconoce lo que ya funciona antes de sugerir mejoras.',
    '- Presenta Comergio como acompañamiento, no como sustituto brusco de lo que hacen.',
    '- Los puntajes (0-100) miden qué tan reunidos/articulados están los procesos hoy, NO la calidad moral del colegio.',
    '- Un puntaje más bajo significa más espacio para acompañar, no "malo".',
    '- Si escribieron texto libre en "Otro", interprétalo con cuidado y menciónalo en otherInsights.',
    '',
    `Colegio: ${normalizeText(schoolName) || '(sin nombre)'}`,
    note ? `Nota final del colegio: ${normalizeText(note)}` : '',
    localOverall != null ? `Referencia interna (índice heurístico local): ${localOverall}/100. Puedes ajustarlo ±12 puntos si el relato lo justifica, sin ser duro.` : '',
    '',
    'Respuestas del cuestionario:',
    buildQuestionnaireBlock(questionnaire),
    '',
    'Devuelve SOLO JSON válido (sin markdown) con esta forma exacta:',
    JSON.stringify({
      overall: 52,
      band: {
        label: 'En evolución',
        headline: 'Frase serena de una línea',
        paragraph: 'Párrafo corto, 2-3 oraciones, tono consultivo.',
      },
      areas: AREA_IDS.map((id) => ({
        id,
        score: id === 'store' ? 40 : 55,
        excluded: false,
        sentence: 'Una oración sobre este frente.',
      })),
      strengths: ['Fortaleza 1', 'Fortaleza 2'],
      accompaniments: [
        { title: 'Comunicaciones', text: 'Cómo Comergio puede acompañar.' },
      ],
      otherInsights: [
        {
          questionId: 'family_news',
          areaLabel: 'Comunicaciones',
          summary: 'Resumen de lo que dijeron en Otro.',
          accompaniment: 'Sugerencia concreta y amable.',
        },
      ],
    }),
    '',
    'Para "store", si el colegio indicó que no tienen tienda/cafetería, usa score null y excluded true.',
    'Máximo 4 strengths, máximo 5 accompaniments, otherInsights solo donde haya texto libre relevante.',
  ].filter(Boolean).join('\n');
}

function normalizeBand(band, overall) {
  const label = normalizeText(band?.label) || 'Lectura de procesos';
  const headline = normalizeText(band?.headline) || 'Hay espacio para acompañar al colegio con calma.';
  const paragraph = normalizeText(band?.paragraph) || 'Comergio puede ayudar a reunir procesos que hoy viven en varios canales, sin cambiar la cultura del equipo de un día para otro.';
  return { label, headline, paragraph, id: overall >= 85 ? 'joined' : overall >= 70 ? 'ordered' : overall >= 52 ? 'evolving' : 'open' };
}

function mergeAiReport(localReport, aiParsed) {
  const localAreas = Array.isArray(localReport?.areas) ? localReport.areas : [];
  const aiAreas = Array.isArray(aiParsed?.areas) ? aiParsed.areas : [];
  const areas = localAreas.map((localArea) => {
    const aiArea = aiAreas.find((item) => item.id === localArea.id) || {};
    const excluded = Boolean(aiArea.excluded ?? localArea.excluded);
    const score = excluded ? null : clampScore(aiArea.score ?? localArea.score);
    return {
      id: localArea.id,
      label: localArea.label,
      summary: localArea.summary,
      score,
      excluded,
      sentence: normalizeText(aiArea.sentence) || localArea.sentence || '',
    };
  });

  const scoredAreas = areas.filter((area) => area.score != null);
  const overallFromAreas = scoredAreas.length
    ? clampScore(scoredAreas.reduce((total, area) => total + area.score, 0) / scoredAreas.length)
    : null;
  const overall = clampScore(aiParsed?.overall) ?? overallFromAreas ?? localReport?.overall ?? null;

  return {
    overall,
    band: normalizeBand(aiParsed?.band, overall || 0),
    areas,
    strengths: (Array.isArray(aiParsed?.strengths) ? aiParsed.strengths : [])
      .map(normalizeText)
      .filter(Boolean)
      .slice(0, 4),
    accompaniments: (Array.isArray(aiParsed?.accompaniments) ? aiParsed.accompaniments : [])
      .map((item) => ({
        questionId: normalizeText(item?.questionId),
        areaId: normalizeText(item?.areaId),
        title: normalizeText(item?.title) || 'Acompañamiento',
        text: normalizeText(item?.text),
        priority: 50,
      }))
      .filter((item) => item.text)
      .slice(0, 5),
    otherInsights: (Array.isArray(aiParsed?.otherInsights) ? aiParsed.otherInsights : [])
      .map((item) => ({
        questionId: normalizeText(item?.questionId),
        areaId: normalizeText(item?.areaId),
        areaLabel: normalizeText(item?.areaLabel) || AREA_LABELS[item?.areaId] || 'Proceso',
        summary: normalizeText(item?.summary),
        accompaniment: normalizeText(item?.accompaniment),
        text: normalizeText(item?.text),
      }))
      .filter((item) => item.summary || item.text)
      .slice(0, 6),
    aiEnhanced: true,
    aiModel: String(process.env.OPENAI_MODEL || 'gpt-5-mini').trim(),
  };
}

async function analyzeSchoolInterviewWithAi(payload = {}) {
  const localReport = payload.localReport && typeof payload.localReport === 'object'
    ? payload.localReport
    : null;

  if (!localReport) {
    const error = new Error('Falta la lectura local para analizar.');
    error.statusCode = 400;
    throw error;
  }

  if (!openAiClient) {
    return {
      report: { ...localReport, aiEnhanced: false, aiModel: null },
      usedAi: false,
    };
  }

  const prompt = buildAnalyzePrompt(payload);
  const response = await openAiClient.responses.create({
    model: String(process.env.OPENAI_MODEL || 'gpt-5-mini').trim(),
    input: prompt,
  });

  const raw = normalizeText(response?.output_text || '');
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('OpenAI no devolvió JSON válido.');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const report = mergeAiReport(localReport, parsed);
  if (!report.strengths.length) {
    report.strengths = localReport.strengths || [];
  }
  if (!report.accompaniments.length) {
    report.accompaniments = localReport.accompaniments || [];
  }
  if (!report.otherInsights.length && Array.isArray(localReport.otherInsights)) {
    report.otherInsights = localReport.otherInsights;
  }

  return {
    report,
    usedAi: true,
  };
}

module.exports = {
  analyzeSchoolInterviewWithAi,
};
