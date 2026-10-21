#!/usr/bin/env node
// One-off: generates the photos shared by every demo school feed.
//   node scripts/generateDemoFeedImages.js            -> creation-day base photos (src/assets/demo-feed)
//   node scripts/generateDemoFeedImages.js welcome.jpg -> regenerate a single creation-day photo
//   node scripts/generateDemoFeedImages.js --daily     -> missing daily-post photos (public/assets/demo-feed)
// School-specific text is drawn on top at demo creation (demoFeedImages.service.js).
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const OpenAI = require('openai');
const { DEMO_DAILY_POSTS, buildImagePrompt } = require('../src/services/demoDailyPosts');

const OUTPUT_DIR = path.join(__dirname, '../src/assets/demo-feed');
const DAILY_OUTPUT_DIR = path.join(__dirname, '../public/assets/demo-feed');
const DAILY_CONCURRENCY = 4;

const IMAGES = [
  {
    file: 'welcome.jpg',
    prompt: 'Warm, joyful editorial photograph of Latin American parents walking their young children (ages 4 to 7) to the entrance of a modern, green, sunny school on the first day of the school year. Kids wear backpacks and neat school uniforms, parents smile and hold their hands. Soft morning light, shallow depth of field, natural colors. Leave the top third of the image as calm sky and soft background with no people, suitable for a text overlay. No text, no letters, no logos.',
  },
  {
    file: 'pension.jpg',
    prompt: 'Clean, modern photograph of a smiling Latin American mother sitting on a bright living room sofa, tapping a single button on her smartphone to pay a bill, looking relieved and happy. Soft daylight, minimal home interior in white and light blue tones, phone screen not readable. Leave the left half of the image calm and uncluttered for a text overlay. No text, no letters, no logos, no numbers.',
  },
  {
    file: 'activity.jpg',
    prompt: 'Candid, cheerful photograph of a group of Latin American kindergarten and first-grade children in a bright classroom doing a hands-on art and science activity together, painting and building with colorful materials, laughing, with a friendly teacher kneeling beside them. Natural window light, vivid but realistic colors, documentary style. No text, no letters, no logos.',
  },
];

async function generateImage(client, model, { prompt, outputPath }) {
  const response = await client.images.generate({
    model,
    prompt,
    n: 1,
    size: '1536x1024',
  });
  const item = response?.data?.[0];
  if (!item?.b64_json) {
    throw new Error(`No image returned for ${path.basename(outputPath)}`);
  }
  const output = await sharp(Buffer.from(item.b64_json, 'base64'))
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  await fs.writeFile(outputPath, output);
  console.log(`[demo-feed] saved ${path.basename(outputPath)} (${Math.round(output.length / 1024)} KB)`);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function generateDailyImages(client, model) {
  await fs.mkdir(DAILY_OUTPUT_DIR, { recursive: true });
  const pending = [];
  for (const post of DEMO_DAILY_POSTS) {
    const outputPath = path.join(DAILY_OUTPUT_DIR, post.image);
    if (!(await fileExists(outputPath))) {
      pending.push({ prompt: buildImagePrompt(post), outputPath });
    }
  }
  console.log(`[demo-feed] ${pending.length} daily images to generate with ${model}`);

  for (let index = 0; index < pending.length; index += DAILY_CONCURRENCY) {
    await Promise.all(pending.slice(index, index + DAILY_CONCURRENCY).map((job) => generateImage(client, model, job)));
  }
}

async function main() {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const client = new OpenAI({ apiKey });
  const model = String(process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim();
  const only = process.argv[2];

  if (only === '--daily') {
    await generateDailyImages(client, model);
    return;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for (const image of IMAGES) {
    if (only && image.file !== only) continue;
    console.log(`[demo-feed] generating ${image.file} with ${model}`);
    await generateImage(client, model, { prompt: image.prompt, outputPath: path.join(OUTPUT_DIR, image.file) });
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
