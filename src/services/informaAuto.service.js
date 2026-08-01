const { OpenAI } = require('openai');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs/promises');
const InformaPost = require('../models/informaPost.model');
const {
  runInControlDb,
  normalizeSchoolId,
} = require('../config/db');
const {
  processAndStoreUploadedImage,
  isCloudinaryEnabled,
  normalizeStoredImageUrl,
} = require('../utils/imageUpload');
const {
  serializePostForViewer,
  canPublishInforma,
  notifyPublishedPost,
  INFORMA_PUBLIC_AUTHOR_NAME,
  INFORMA_PUBLIC_AUTHOR_PHOTO,
} = require('./informa.service');

const openAiClient = String(process.env.OPENAI_API_KEY || '').trim()
  ? new OpenAI({ apiKey: String(process.env.OPENAI_API_KEY || '').trim() })
  : null;

const INFORMA_TOPICS = [
  { key: 'inteligencia_artificial', label: 'Inteligencia Artificial', query: 'inteligencia artificial' },
  { key: 'tecnologia', label: 'Tecnología', query: 'tecnología innovación' },
  { key: 'educacion', label: 'Educación', query: 'educación tecnología escuelas' },
  { key: 'ciencia', label: 'Ciencia', query: 'ciencia descubrimientos' },
  { key: 'innovacion', label: 'Innovación', query: 'innovación startups' },
  { key: 'ciberseguridad', label: 'Ciberseguridad', query: 'ciberseguridad hacking' },
  { key: 'salud', label: 'Salud y medicina', query: 'salud medicina avance' },
  { key: 'espacio', label: 'Espacio', query: 'espacio NASA astronomía' },
  { key: 'robotica', label: 'Robótica', query: 'robótica robots' },
  { key: 'energias', label: 'Energías renovables', query: 'energías renovables' },
  { key: 'empresas', label: 'Empresas tecnológicas', query: 'empresas tecnológicas' },
  { key: 'descubrimientos', label: 'Descubrimientos científicos', query: 'descubrimiento científico' },
  { key: 'productividad', label: 'Productividad y trabajo', query: 'productividad trabajo remoto' },
  { key: 'tendencias', label: 'Tendencias digitales', query: 'tendencias digitales' },
];

const AUTO_AUTHOR = {
  schoolId: 'comergio-informa',
  userId: 'informa-auto',
  name: INFORMA_PUBLIC_AUTHOR_NAME,
  role: 'super_admin',
  photoUrl: INFORMA_PUBLIC_AUTHOR_PHOTO,
};

function normalizeText(value) {
  return String(value || '').trim();
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = String(block || '').match(regex);
  return decodeXmlEntities(match?.[1] || '');
}

function extractAttribute(block, tagName, attributeName) {
  const regex = new RegExp(`<${tagName}[^>]*${attributeName}=["']([^"']+)["'][^>]*/?>`, 'i');
  const match = String(block || '').match(regex);
  return normalizeText(match?.[1] || '');
}

function buildGoogleNewsRssUrl(query) {
  const params = new URLSearchParams({
    q: query,
    hl: 'es-419',
    gl: 'CO',
    ceid: 'CO:es',
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

function getBogotaParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function resolveSlotKey(date = new Date()) {
  const { dateKey, hour, minute } = getBogotaParts(date);
  if (hour === 7 && minute <= 14) return `${dateKey}-07`;
  if (hour === 12 && minute <= 14) return `${dateKey}-12`;
  return '';
}

function pickTopic(slotKey = '') {
  const hash = String(slotKey || Date.now())
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return INFORMA_TOPICS[hash % INFORMA_TOPICS.length];
}

async function fetchRssItems(topic) {
  const response = await fetch(buildGoogleNewsRssUrl(topic.query), {
    headers: {
      'User-Agent': 'ComergioInformaBot/1.0',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });
  if (!response.ok) {
    throw new Error(`No se pudo consultar noticias (${response.status}).`);
  }

  const xml = await response.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match = itemRegex.exec(xml);
  while (match && items.length < 12) {
    const block = match[1];
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const source = extractTag(block, 'source');
    const description = extractTag(block, 'description');
    const imageUrl = extractAttribute(block, 'enclosure', 'url')
      || extractAttribute(block, 'media:content', 'url')
      || '';
    if (title && link) {
      items.push({
        title,
        url: link,
        publisher: source,
        description,
        imageUrl,
        topic: topic.label,
        topicKey: topic.key,
      });
    }
    match = itemRegex.exec(xml);
  }
  return items;
}

async function findUnusedStory(topic) {
  const items = await fetchRssItems(topic);
  for (const item of items) {
    const exists = await runInControlDb(() => InformaPost.findOne({
      informaEntity: 'post',
      'source.url': item.url,
    }).select('_id').lean());
    if (!exists) {
      return item;
    }
  }
  return null;
}

function cleanFallbackTitle(title) {
  return normalizeText(title)
    .replace(/\s+[-–|]\s+[^-–|]{2,40}$/u, '')
    .slice(0, 110);
}

async function generateCopyWithOpenAi(story) {
  if (!openAiClient) {
    const cleanTitle = cleanFallbackTitle(story.title);
    return {
      title: cleanTitle,
      body: story.description
        ? `${story.description.slice(0, 420)}${story.description.length > 420 ? '…' : ''}`
        : `Una novedad relevante en ${story.topic}. En Comergio Informa te contamos lo esencial para que el equipo se mantenga al día.`,
      model: 'fallback',
    };
  }

  const prompt = [
    'Eres el editor de Comergio Informa, un feed interno para docentes y staff escolar en Colombia.',
    'A partir de la noticia fuente, genera un título y un resumen cortos en español neutro, claros y atractivos.',
    'No inventes datos. No uses clickbait. No menciones "Gerencia". Firma implícita: Comergio Informa.',
    'Devuelve SOLO JSON válido con esta forma: {"title":"...","body":"..."}',
    `Tema: ${story.topic}`,
    `Título fuente: ${story.title}`,
    `Resumen fuente: ${story.description || '(sin resumen)'}`,
    `Medio: ${story.publisher || '(desconocido)'}`,
    'El título debe tener máximo 90 caracteres.',
    'El body debe tener entre 280 y 520 caracteres, 1 o 2 párrafos cortos.',
  ].join('\n');

  const response = await openAiClient.responses.create({
    model: String(process.env.OPENAI_MODEL || 'gpt-5-mini').trim(),
    input: prompt,
  });

  const raw = normalizeText(response?.output_text || '');
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('OpenAI no devolvió JSON válido para Comergio Informa.');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const title = normalizeText(parsed.title).slice(0, 120);
  const body = normalizeText(parsed.body).slice(0, 1200);
  if (!title || !body) {
    throw new Error('OpenAI devolvió título o resumen vacío.');
  }

  return {
    title,
    body,
    model: String(process.env.OPENAI_MODEL || 'gpt-5-mini').trim(),
  };
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapTitleLines(title, maxChars = 28, maxLines = 3) {
  const words = normalizeText(title).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  const leftover = words.join(' ').slice(lines.join(' ').length).trim();
  if (leftover && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}…`.slice(0, maxChars + 1);
  }
  return lines.slice(0, maxLines);
}

async function loadColibriBuffer() {
  const candidates = [
    path.resolve(process.cwd(), 'comergio-frontend/public/informa/avatar-colibri.png'),
    path.resolve(process.cwd(), 'public/informa/avatar-colibri.png'),
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate);
    } catch (_error) {
      // try next
    }
  }
  return null;
}

async function downloadImageBuffer(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ComergioInformaBot/1.0' },
    });
    if (!response.ok) return null;
    const contentType = String(response.headers.get('content-type') || '');
    if (!contentType.startsWith('image/')) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (_error) {
    return null;
  }
}

async function buildBrandedImageBuffer({ title, topic, storyImageUrl = '' }) {
  const width = 1200;
  const height = 675;
  const lines = wrapTitleLines(title, 30, 3);
  const titleSvg = lines.map((line, index) => (
    `<text x="72" y="${250 + (index * 58)}" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="800" fill="#102A43">${escapeXml(line)}</text>`
  )).join('');

  const storyBuffer = await downloadImageBuffer(storyImageUrl);
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#D8F5EC"/>
          <stop offset="55%" stop-color="#E7F4FF"/>
          <stop offset="100%" stop-color="#EEF6FF"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="36" fill="url(#bg)"/>
      <rect x="48" y="48" width="210" height="42" rx="21" fill="#E8EEFC"/>
      <text x="72" y="76" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" fill="#2F6FED">COMERGIO INFORMA</text>
      <text x="72" y="150" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#64748B">${escapeXml(topic || 'Novedad')}</text>
      ${titleSvg}
      <rect x="72" y="470" width="72" height="8" rx="4" fill="#3B82F6"/>
      <text x="72" y="530" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600" fill="#475569">Para el equipo Comergio</text>
    </svg>
  `;

  const base = sharp(Buffer.from(svg)).png();
  const composites = [];

  if (storyBuffer) {
    composites.push({
      input: await sharp(storyBuffer).resize(360, 360, { fit: 'cover' }).png().toBuffer(),
      top: 150,
      left: 760,
    });
  }

  const colibri = await loadColibriBuffer();
  if (colibri) {
    composites.push({
      input: await sharp(colibri).resize(88, 88, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
      top: 540,
      left: 1050,
    });
  }

  if (composites.length) {
    return base.composite(composites).png().toBuffer();
  }
  return base.png().toBuffer();
}

async function storeBrandedImage(buffer, preferredName = 'informa-auto') {
  const file = {
    buffer,
    mimetype: 'image/png',
    originalname: `${preferredName}.png`,
    size: buffer.length,
  };

  const saved = await processAndStoreUploadedImage({
    file,
    folder: 'informa',
    preferredName,
    requireCloudinary: isCloudinaryEnabled(),
  });

  return {
    kind: 'image',
    src: normalizeStoredImageUrl(saved.url),
    thumbUrl: normalizeStoredImageUrl(saved.thumbUrl || saved.url),
    alt: 'Comergio Informa',
  };
}

function serializeAdminDraft(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    title: normalizeText(doc.title),
    body: normalizeText(doc.body),
    status: normalizeText(doc.status) || 'draft',
    media: (doc.media || []).map((item) => ({
      kind: item.kind === 'video' ? 'video' : 'image',
      src: normalizeText(item.src),
      thumbUrl: normalizeText(item.thumbUrl) || normalizeText(item.src),
      alt: normalizeText(item.alt),
    })).filter((item) => item.src),
    source: {
      url: normalizeText(doc.source?.url),
      title: normalizeText(doc.source?.title),
      publisher: normalizeText(doc.source?.publisher),
      topic: normalizeText(doc.source?.topic),
      fetchedAt: doc.source?.fetchedAt || null,
    },
    auto: {
      enabled: Boolean(doc.auto?.enabled),
      slotKey: normalizeText(doc.auto?.slotKey),
      generatedAt: doc.auto?.generatedAt || null,
      model: normalizeText(doc.auto?.model),
    },
    publishedAt: doc.publishedAt || null,
    createdAt: doc.createdAt || null,
  };
}

async function createDraftFromStory({ story, copy, media, slotKey }) {
  const now = new Date();
  return runInControlDb(() => InformaPost.create({
    informaEntity: 'post',
    author: {
      ...AUTO_AUTHOR,
      schoolId: normalizeSchoolId(AUTO_AUTHOR.schoolId),
    },
    title: copy.title,
    body: copy.body,
    media: media ? [media] : [],
    likes: [],
    comments: [],
    status: 'draft',
    source: {
      url: story.url,
      title: story.title,
      publisher: story.publisher || '',
      topic: story.topic || '',
      fetchedAt: now,
    },
    auto: {
      enabled: true,
      slotKey: slotKey || '',
      generatedAt: now,
      model: copy.model || '',
    },
    publishedAt: null,
  }));
}

async function generateInformaDraft({ slotKey = '', force = false } = {}) {
  const resolvedSlot = slotKey || resolveSlotKey(new Date()) || `manual-${Date.now()}`;

  if (!force) {
    const existing = await runInControlDb(() => InformaPost.findOne({
      informaEntity: 'post',
      'auto.slotKey': resolvedSlot,
    }).select('_id status title createdAt source auto media body').lean());
    if (existing && !String(resolvedSlot).startsWith('manual-')) {
      return {
        skipped: true,
        reason: 'Ya existe un borrador o publicación para este horario.',
        draft: serializeAdminDraft(existing),
      };
    }
  }

  const topic = pickTopic(resolvedSlot);
  const story = await findUnusedStory(topic);
  if (!story) {
    throw new Error(`No se encontró una noticia nueva para el tema ${topic.label}.`);
  }

  const copy = await generateCopyWithOpenAi(story);
  const imageBuffer = await buildBrandedImageBuffer({
    title: copy.title,
    topic: story.topic,
    storyImageUrl: story.imageUrl,
  });
  const media = await storeBrandedImage(imageBuffer, `informa-${resolvedSlot}`);
  const draftDoc = await createDraftFromStory({
    story,
    copy,
    media,
    slotKey: resolvedSlot,
  });

  return {
    skipped: false,
    draft: serializeAdminDraft(draftDoc),
  };
}

async function listDrafts({ limit = 30 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 80);
  const drafts = await runInControlDb(() => InformaPost.find({
    informaEntity: 'post',
    status: 'draft',
  })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean());

  return drafts.map(serializeAdminDraft);
}

async function publishDraft({ schoolId, userId, role, postId }) {
  if (!canPublishInforma(role)) {
    throw new Error('Solo Gerencia Comergio puede publicar borradores de Comergio Informa.');
  }

  const publishedAt = new Date();
  const postDoc = await runInControlDb(async () => {
    const draft = await InformaPost.findOne({ _id: postId, informaEntity: 'post', status: 'draft' });
    if (!draft) {
      throw new Error('Borrador no encontrado.');
    }
    draft.status = 'published';
    draft.publishedAt = publishedAt;
    draft.informaEntity = 'post';
    draft.author = {
      schoolId: normalizeSchoolId(schoolId || draft.author?.schoolId || AUTO_AUTHOR.schoolId),
      userId: String(userId || draft.author?.userId || AUTO_AUTHOR.userId),
      name: INFORMA_PUBLIC_AUTHOR_NAME,
      role: 'super_admin',
      photoUrl: INFORMA_PUBLIC_AUTHOR_PHOTO,
    };
    await draft.save();
    return draft;
  });

  setImmediate(() => {
    notifyPublishedPost({
      postDoc,
      excludeSchoolId: schoolId,
      excludeUserId: userId,
    }).catch((error) => {
      console.warn(`[INFORMA_NOTIFY] publish draft fan-out failed: ${error.message || error}`);
    });
  });

  return serializePostForViewer(postDoc, schoolId, userId, role);
}

async function discardDraft({ role, postId }) {
  if (!canPublishInforma(role)) {
    throw new Error('Solo Gerencia Comergio puede descartar borradores.');
  }

  return runInControlDb(async () => {
    const draft = await InformaPost.findOne({ _id: postId, informaEntity: 'post', status: 'draft' });
    if (!draft) {
      throw new Error('Borrador no encontrado.');
    }
    draft.status = 'archived';
    draft.informaEntity = 'post';
    await draft.save();
    return serializeAdminDraft(draft);
  });
}

async function runScheduledInformaDraftJob(now = new Date()) {
  const slotKey = resolveSlotKey(now);
  if (!slotKey) {
    return { ran: false, reason: 'Fuera de ventana horaria (07:00 o 12:00 America/Bogota).' };
  }

  const existing = await runInControlDb(() => InformaPost.findOne({
    informaEntity: 'post',
    'auto.slotKey': slotKey,
  }).select('_id').lean());

  if (existing) {
    return { ran: false, reason: 'Slot ya procesado.', slotKey };
  }

  const result = await generateInformaDraft({ slotKey, force: false });
  return { ran: true, slotKey, ...result };
}

module.exports = {
  INFORMA_TOPICS,
  resolveSlotKey,
  getBogotaParts,
  generateInformaDraft,
  runScheduledInformaDraftJob,
  listDrafts,
  publishDraft,
  discardDraft,
  serializeAdminDraft,
};
