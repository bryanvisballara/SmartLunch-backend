#!/usr/bin/env node
// One-off: generates the base photos used by every demo school feed.
// School-specific text is drawn on top at demo creation (demoFeedImages.service.js).
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const OpenAI = require('openai');

const OUTPUT_DIR = path.join(__dirname, '../src/assets/demo-feed');

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

async function main() {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const client = new OpenAI({ apiKey });
  const model = String(process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim();
  const only = process.argv[2];
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const image of IMAGES) {
    if (only && image.file !== only) continue;
    console.log(`[demo-feed] generating ${image.file} with ${model}`);
    const response = await client.images.generate({
      model,
      prompt: image.prompt,
      n: 1,
      size: '1536x1024',
    });
    const item = response?.data?.[0];
    if (!item?.b64_json) {
      throw new Error(`No image returned for ${image.file}`);
    }

    const output = await sharp(Buffer.from(item.b64_json, 'base64'))
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    await fs.writeFile(path.join(OUTPUT_DIR, image.file), output);
    console.log(`[demo-feed] saved ${image.file} (${Math.round(output.length / 1024)} KB)`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
