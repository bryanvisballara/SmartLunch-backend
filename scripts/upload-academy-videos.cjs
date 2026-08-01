#!/usr/bin/env node
/**
 * Upload Comergio Academy tutorial videos to Cloudinary.
 *
 * Usage (from repo root):
 *   CLOUDINARY_URL="cloudinary://API_KEY:API_SECRET@CLOUD_NAME" \
 *     node scripts/upload-academy-videos.mjs
 *
 * Or set CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET.
 */
const fs = require('fs');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    if (process.env[key]) continue;
    process.env[key] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

loadDotEnv(path.join(__dirname, '..', '.env'));
loadDotEnv(path.join(__dirname, '..', '.env.local'));

const CLOUDINARY_FOLDER = String(process.env.CLOUDINARY_UPLOAD_FOLDER || 'comergio').trim() || 'comergio';

const VIDEOS = [
  {
    localPath: '/Users/usuario/Desktop/docente 1/docente 1.mov',
    publicId: `${CLOUDINARY_FOLDER}/academy/teacher/docente-1`,
    title: 'Docente 1',
  },
  {
    localPath: '/Users/usuario/Desktop/docente 2/docente 2.mov',
    publicId: `${CLOUDINARY_FOLDER}/academy/teacher/docente-2`,
    title: 'Docente 2',
  },
];

function configureCloudinary() {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  const cloudinaryUrl = String(process.env.CLOUDINARY_URL || '').trim();

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    return cloudName;
  }

  if (cloudinaryUrl) {
    cloudinary.config({ secure: true });
    const matched = cloudinaryUrl.match(/@([^/]+)/);
    return matched?.[1] || 'configured-via-url';
  }

  throw new Error(
    'Missing Cloudinary credentials. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET.',
  );
}

function uploadVideo(localPath, publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(
      localPath,
      {
        resource_type: 'video',
        public_id: publicId,
        overwrite: true,
        chunk_size: 6 * 1024 * 1024,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      },
    );
  });
}

async function main() {
  const cloudName = configureCloudinary();
  console.log(`Cloudinary cloud: ${cloudName}`);
  console.log(`Uploading ${VIDEOS.length} academy videos...`);

  const results = [];
  for (const video of VIDEOS) {
    if (!fs.existsSync(video.localPath)) {
      throw new Error(`File not found: ${video.localPath}`);
    }
    const sizeMb = (fs.statSync(video.localPath).size / (1024 * 1024)).toFixed(1);
    console.log(`\n→ ${video.title} (${sizeMb} MB)\n  ${video.localPath}`);
    const uploaded = await uploadVideo(video.localPath, video.publicId);
    results.push({
      title: video.title,
      publicId: uploaded.public_id,
      url: uploaded.secure_url,
      duration: uploaded.duration,
      bytes: uploaded.bytes,
      format: uploaded.format,
    });
    console.log(`  ✓ ${uploaded.secure_url}`);
  }

  const outPath = path.join(__dirname, 'academy-video-upload-result.json');
  fs.writeFileSync(outPath, `${JSON.stringify({ cloudName, uploadedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log(`\nSaved: ${outPath}`);
  console.log('\nPaste these URLs into academyVideos.js:');
  for (const item of results) {
    console.log(`- ${item.title}: ${item.url}`);
  }
}

main().catch((error) => {
  console.error(`\nUpload failed: ${error.message || error}`);
  process.exit(1);
});
