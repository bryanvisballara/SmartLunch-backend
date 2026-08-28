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

const AUTO_PUBLISH_START_DATE = String(process.env.INFORMA_AUTO_PUBLISH_START || '2026-08-29').trim();
const WEEKLY_PUBLISH_LIMIT = Math.max(1, Number(process.env.INFORMA_AUTO_WEEKLY_LIMIT || 2) || 2);
const WEEKLY_SLOT_WEEKDAYS = [1, 4];

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

function weekdayFromDateKey(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) {
    return 0;
  }
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
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
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    dateKey,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayFromDateKey(dateKey),
  };
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) {
    return '';
  }
  const next = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return next.toISOString().slice(0, 10);
}

function getBogotaWeekStartKey(date = new Date()) {
  const { dateKey, weekday } = getBogotaParts(date);
  const daysFromMonday = (weekday + 6) % 7;
  return addDaysToDateKey(dateKey, -daysFromMonday);
}

function bogotaDateToUtc(dateKey, hour = 0, minute = 0) {
  return new Date(`${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-05:00`);
}

function isAutoPublishMode(date = new Date()) {
  const { dateKey } = getBogotaParts(date);
  return Boolean(AUTO_PUBLISH_START_DATE) && dateKey >= AUTO_PUBLISH_START_DATE;
}

function isWeeklyAutoSlotDay(parts) {
  if (WEEKLY_SLOT_WEEKDAYS.includes(parts.weekday)) {
    return true;
  }
  return parts.dateKey === AUTO_PUBLISH_START_DATE;
}

function resolveSlotKey(date = new Date()) {
  const parts = getBogotaParts(date);
  const { dateKey, hour, minute } = parts;
  if (hour !== 7 && hour !== 12) {
    return '';
  }
  if (minute > 14) {
    return '';
  }

  if (!isAutoPublishMode(date)) {
    if (hour === 7) return `${dateKey}-07`;
    if (hour === 12) return `${dateKey}-12`;
    return '';
  }

  if (hour === 7 && isWeeklyAutoSlotDay(parts)) {
    return `${dateKey}-07`;
  }
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
  if (!words.length) return [];

  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) {
        current = '';
        break;
      }
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  const usedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (usedWords < words.length && lines.length) {
    const last = lines[lines.length - 1].replace(/\s+\S*$/, '').trim() || lines[lines.length - 1];
    lines[lines.length - 1] = `${last}…`.slice(0, maxChars + 1);
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
    if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (_error) {
    return null;
  }
}

const COVER_WIDTH = 1080;
const COVER_HEIGHT = 1350;

function buildPhotoScenePrompt({ title, body, topic }) {
  return [
    'Photorealistic editorial news photograph for Instagram, vertical 4:5 frame.',
    'Must look like a real camera photo: natural lighting, real locations, real people or real campuses/products.',
    'STRICTLY FORBIDDEN: illustration, cartoon, vector art, flat design, 3D render, clipart, icons floating in air, anime, watercolor, collage of drawings.',
    'Absolutely no text, letters, logos, watermarks, captions, UI chrome, or overlays in the photo.',
    'Compose with clear space in the lower third for a later text overlay (slightly darker or empty foreground is fine).',
    `News category: ${topic || 'technology'}`,
    `Headline: ${title}`,
    `Context: ${String(body || '').slice(0, 280)}`,
    'If the headline names a university, city, company or landmark, show that real place or a believable documentary scene of it.',
    'Cinematic documentary style, high resolution, sharp focus.',
  ].join('\n');
}

async function generateImageWithOpenAi({ title, body, topic }) {
  if (!openAiClient) {
    return null;
  }

  const prompt = buildPhotoScenePrompt({ title, body, topic });
  const model = String(process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim();
  const isDalle3 = /dall-e-3/i.test(model);
  const isLegacyDalle = /^dall-e-/i.test(model);
  // Prefer portrait for Instagram-style covers when the model allows it.
  const size = isDalle3
    ? '1024x1792'
    : (isLegacyDalle ? '1024x1024' : '1024x1536');
  const response = await openAiClient.images.generate({
    model,
    prompt,
    n: 1,
    size,
    ...(isDalle3 ? { quality: 'standard' } : {}),
  });

  const item = response?.data?.[0] || null;
  if (item?.b64_json) {
    return Buffer.from(item.b64_json, 'base64');
  }
  if (item?.url) {
    return downloadImageBuffer(item.url);
  }
  return null;
}

function buildInstagramOverlaySvg({ title, topic, body = '' }) {
  const width = COVER_WIDTH;
  const height = COVER_HEIGHT;
  const titleLines = wrapTitleLines(String(title || '').toUpperCase(), 26, 5);
  const subtitle = wrapTitleLines(body, 42, 2).join(' ');
  const brand = 'COMERGIO INFORMA';
  const topicLabel = String(topic || 'NOVEDAD').toUpperCase();
  const titleStartY = titleLines.length > 4 ? 900 : 960;
  const titleBlock = titleLines.map((line, index) => (
    `<text x="54" y="${titleStartY + (index * 54)}" font-family="Arial Black, Arial Narrow, Helvetica, sans-serif" font-size="48" font-weight="900" letter-spacing="-0.5" fill="#5AD2FF">${escapeXml(line)}</text>`
  )).join('');
  const subtitleY = titleStartY + (titleLines.length * 54) + 26;

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="35%" stop-color="#000000" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.92"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${height * 0.42}" width="${width}" height="${height * 0.58}" fill="url(#bottomFade)"/>
      <text x="54" y="88" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" letter-spacing="3" fill="#FFFFFF">${escapeXml(brand)}</text>
      <line x1="54" y1="102" x2="280" y2="102" stroke="#FFFFFF" stroke-width="2" stroke-opacity="0.85"/>
      <text x="${width - 54}" y="88" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" letter-spacing="2" fill="#FFFFFF">${escapeXml(topicLabel)}</text>
      ${titleBlock}
      ${subtitle ? `<text x="54" y="${subtitleY}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="600" fill="#FFFFFF">${escapeXml(subtitle)}</text>` : ''}
    </svg>
  `;
}

async function composeInstagramCover({ photoBuffer, title, topic, body = '' }) {
  if (!photoBuffer) return null;

  const base = await sharp(photoBuffer)
    .rotate()
    .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer();

  const overlay = await sharp(Buffer.from(buildInstagramOverlaySvg({ title, topic, body })))
    .png()
    .toBuffer();

  const composites = [{ input: overlay, top: 0, left: 0 }];
  const colibri = await loadColibriBuffer();
  if (colibri) {
    composites.push({
      input: await sharp(colibri)
        .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
      top: COVER_HEIGHT - 92,
      left: COVER_WIDTH - 92,
    });
  }

  return sharp(base).composite(composites).png().toBuffer();
}

async function resolveCoverPhotoBuffer({ title, body, topic, storyImageUrl = '' }) {
  // Prefer a real news photo when the source provides one.
  const sourced = await downloadImageBuffer(storyImageUrl);
  if (sourced) {
    return { buffer: sourced, imageModel: 'source-photo' };
  }

  const generated = await generateImageWithOpenAi({ title, body, topic });
  if (generated) {
    return {
      buffer: generated,
      imageModel: String(process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim(),
    };
  }

  return { buffer: null, imageModel: '' };
}

async function buildBrandedImageBuffer({ title, topic, storyImageUrl = '', body = '' }) {
  const sourced = await downloadImageBuffer(storyImageUrl);
  if (sourced) {
    return composeInstagramCover({
      photoBuffer: sourced,
      title,
      topic,
      body,
    });
  }

  // Last-resort solid photographic-looking gradient if no photo is available.
  const fallbackSvg = `
    <svg width="${COVER_WIDTH}" height="${COVER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0B1C2C"/>
          <stop offset="100%" stop-color="#102A43"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
    </svg>
  `;
  const photoBuffer = await sharp(Buffer.from(fallbackSvg)).png().toBuffer();
  return composeInstagramCover({ photoBuffer, title, topic, body });
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
    requireCloudinary: false,
    maxWidth: COVER_WIDTH,
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

async function generateInformaDraft({ slotKey = '', force = false, clearExisting = false } = {}) {
  const resolvedSlot = slotKey || resolveSlotKey(new Date()) || `manual-${Date.now()}`;

  if (clearExisting) {
    await runInControlDb(() => InformaPost.updateMany(
      { informaEntity: 'post', status: 'draft' },
      { $set: { status: 'archived', informaEntity: 'post' } }
    ));
  }

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
  let imageBuffer = null;
  let imageModel = '';

  try {
    const resolved = await resolveCoverPhotoBuffer({
      title: copy.title,
      body: copy.body,
      topic: story.topic,
      storyImageUrl: story.imageUrl,
    });
    if (resolved.buffer) {
      imageBuffer = await composeInstagramCover({
        photoBuffer: resolved.buffer,
        title: copy.title,
        topic: story.topic,
        body: copy.body,
      });
      imageModel = resolved.imageModel
        ? `${resolved.imageModel}+overlay`
        : 'photo+overlay';
    }
  } catch (imageError) {
    console.warn(`[INFORMA_IMAGE] Cover compose failed: ${imageError.message || imageError}`);
  }

  if (!imageBuffer) {
    imageBuffer = await buildBrandedImageBuffer({
      title: copy.title,
      topic: story.topic,
      storyImageUrl: story.imageUrl,
      body: copy.body,
    });
  }

  const media = await storeBrandedImage(imageBuffer, `informa-${resolvedSlot}`);
  const draftDoc = await createDraftFromStory({
    story,
    copy: {
      ...copy,
      model: [copy.model, imageModel].filter(Boolean).join('+') || copy.model,
    },
    media,
    slotKey: resolvedSlot,
  });

  return {
    skipped: false,
    draft: serializeAdminDraft(draftDoc),
    imageModel: imageModel || 'branded-fallback',
  };
}

async function clearPendingDrafts({ role } = {}) {
  if (!canPublishInforma(role)) {
    throw new Error('Solo Gerencia Comergio puede limpiar borradores de Comergio Informa.');
  }

  return runInControlDb(async () => {
    const result = await InformaPost.updateMany(
      { informaEntity: 'post', status: 'draft' },
      { $set: { status: 'archived', informaEntity: 'post' } }
    );
    return { cleared: Number(result.modifiedCount || 0) };
  });
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

async function publishDraftById(postId, { schoolId, userId } = {}) {
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

  return serializePostForViewer(postDoc, schoolId || AUTO_AUTHOR.schoolId, userId || AUTO_AUTHOR.userId, 'super_admin');
}

async function publishDraft({ schoolId, userId, role, postId }) {
  if (!canPublishInforma(role)) {
    throw new Error('Solo Gerencia Comergio puede publicar borradores de Comergio Informa.');
  }

  return publishDraftById(postId, { schoolId, userId });
}

async function countAutoPublishedThisWeek(date = new Date()) {
  const weekStartKey = getBogotaWeekStartKey(date);
  const weekEndKey = addDaysToDateKey(weekStartKey, 7);
  if (!weekStartKey || !weekEndKey) {
    return 0;
  }

  return runInControlDb(() => InformaPost.countDocuments({
    informaEntity: 'post',
    status: 'published',
    'auto.enabled': true,
    publishedAt: {
      $gte: bogotaDateToUtc(weekStartKey),
      $lt: bogotaDateToUtc(weekEndKey),
    },
  }));
}

async function claimOldestDraftForSlot(slotKey) {
  return runInControlDb(async () => {
    const draft = await InformaPost.findOne({
      informaEntity: 'post',
      status: 'draft',
    }).sort({ createdAt: 1 });
    if (!draft) {
      return null;
    }
    draft.auto = {
      ...(draft.auto?.toObject?.() || draft.auto || {}),
      enabled: true,
      slotKey,
      generatedAt: draft.auto?.generatedAt || draft.createdAt || new Date(),
      model: draft.auto?.model || '',
    };
    await draft.save();
    return draft;
  });
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
    return {
      ran: false,
      reason: isAutoPublishMode(now)
        ? 'Fuera de ventana (lunes y jueves 07:00 America/Bogota, 2 por semana).'
        : 'Fuera de ventana horaria (07:00 o 12:00 America/Bogota).',
    };
  }

  const existing = await runInControlDb(() => InformaPost.findOne({
    informaEntity: 'post',
    'auto.slotKey': slotKey,
  }).select('_id').lean());

  if (existing) {
    return { ran: false, reason: 'Slot ya procesado.', slotKey };
  }

  const autoPublish = isAutoPublishMode(now);
  if (autoPublish) {
    const weeklyCount = await countAutoPublishedThisWeek(now);
    if (weeklyCount >= WEEKLY_PUBLISH_LIMIT) {
      return {
        ran: false,
        reason: `Tope semanal alcanzado (${WEEKLY_PUBLISH_LIMIT} publicaciones).`,
        slotKey,
        weeklyCount,
      };
    }

    const reusedDraft = await claimOldestDraftForSlot(slotKey);
    if (reusedDraft) {
      const published = await publishDraftById(reusedDraft._id);
      return {
        ran: true,
        published: true,
        reusedDraft: true,
        slotKey,
        draft: serializeAdminDraft({ ...reusedDraft.toObject(), status: 'published', publishedAt: new Date() }),
        post: published,
      };
    }
  }

  const result = await generateInformaDraft({ slotKey, force: false });
  if (result?.skipped) {
    return { ran: false, slotKey, ...result };
  }

  if (autoPublish && result?.draft?.id) {
    const published = await publishDraftById(result.draft.id);
    return {
      ran: true,
      published: true,
      reusedDraft: false,
      slotKey,
      ...result,
      post: published,
    };
  }

  return { ran: true, published: false, slotKey, ...result };
}

module.exports = {
  INFORMA_TOPICS,
  AUTO_PUBLISH_START_DATE,
  WEEKLY_PUBLISH_LIMIT,
  resolveSlotKey,
  getBogotaParts,
  generateInformaDraft,
  runScheduledInformaDraftJob,
  listDrafts,
  clearPendingDrafts,
  publishDraft,
  discardDraft,
  serializeAdminDraft,
};
