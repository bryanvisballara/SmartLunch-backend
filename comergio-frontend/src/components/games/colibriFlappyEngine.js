const STORAGE_KEY = 'comergioColibriFlappyBest';

const DEFAULTS = {
  gravity: 0.42,
  flapVelocity: -7.4,
  pipeSpeed: 2.8,
  pipeGap: 168,
  pipeWidth: 86,
  spawnEveryMs: 1380,
  minPipeSpacing: 215,
  maxPipes: 4,
  groundHeight: 56,
};

const PILLAR_TYPES = [
  { id: 'purple-cloud', label: 'Poste nube', src: '/game/pillar-purple-cloud.png' },
  { id: 'cyan', label: 'Poste cyan', src: '/game/pillar-cyan.png' },
  { id: 'orange-chart', label: 'Poste naranja', src: '/game/pillar-orange-chart.png' },
  { id: 'magenta-chat', label: 'Poste magenta', src: '/game/pillar-magenta-chat.png' },
  { id: 'blue-grad', label: 'Poste azul', src: '/game/pillar-blue-grad.png' },
  { id: 'green-calendar', label: 'Poste verde', src: '/game/pillar-green-calendar.png' },
];

// Azules (fondo 1), morados (fondo 2), solo naranja (fondo 3)
const PILLAR_SETS_BY_BG = [
  [1, 4],
  [0, 3],
  [2],
];

const BACKGROUND_LAYERS = [
  { id: 'campus', name: 'Campus Comergio', src: '/game/bg-campus.png', accent: '#2ec4e8' },
  { id: 'cyber-blue', name: 'Mundo digital', src: '/game/bg-cyber-blue.png', accent: '#00d2ff' },
  { id: 'cyber-sunset', name: 'Ciudad del futuro', src: '/game/bg-cyber-sunset.png', accent: '#c084fc' },
];

const BG_TRANSITION_MS = 1600;

const SOUNDS = {
  flap: '/game/flap.wav',
  pass: '/game/pass.mp3',
  gameover: '/game/gameover.mp3',
};

const SPRITE_URL = '/game/colibri-fly.png';

let activeColibriGameInstance = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadBestScore() {
  const value = Number.parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
  return Number.isFinite(value) ? value : 0;
}

function saveBestScore(score) {
  localStorage.setItem(STORAGE_KEY, String(score));
}

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let sharedAudioContext = null;

function getSharedAudioContext() {
  if (!AudioContextClass) {
    return null;
  }

  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextClass();
  }

  return sharedAudioContext;
}

async function unlockSharedAudioContext() {
  const context = getSharedAudioContext();
  if (!context || context.state === 'running') {
    return;
  }

  try {
    await context.resume();
  } catch {
    // Ignore unlock failures; fallback playback may still work.
  }
}

function createSoundPlayer(soundUrl, volume = 0.85) {
  let gainNode = null;
  let soundBuffer = null;
  let loadPromise = null;
  let fallbackPool = [];
  let fallbackPoolIndex = 0;

  function ensureGainNode(context) {
    if (!gainNode) {
      gainNode = context.createGain();
      gainNode.gain.value = volume;
      gainNode.connect(context.destination);
    }

    return gainNode;
  }

  function ensureContext() {
    const context = getSharedAudioContext();
    if (!context) {
      return null;
    }

    ensureGainNode(context);
    return context;
  }

  function ensureFallbackPool() {
    if (fallbackPool.length) {
      return fallbackPool;
    }

    fallbackPool = Array.from({ length: 6 }, () => {
      const audio = new Audio(soundUrl);
      audio.preload = 'auto';
      audio.volume = volume;
      audio.load();
      return audio;
    });

    return fallbackPool;
  }

  function loadSound() {
    if (loadPromise) {
      return loadPromise;
    }

    loadPromise = fetch(soundUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.arrayBuffer();
      })
      .then((arrayBuffer) => {
        const context = ensureContext();
        if (!context) {
          return null;
        }

        return context.decodeAudioData(arrayBuffer.slice(0));
      })
      .then((buffer) => {
        soundBuffer = buffer;
        return buffer;
      })
      .catch(() => null);

    return loadPromise;
  }

  function playFallback() {
    const pool = ensureFallbackPool();
    const audio = pool[fallbackPoolIndex % pool.length];
    fallbackPoolIndex = (fallbackPoolIndex + 1) % pool.length;

    if (!audio) {
      return;
    }

    audio.volume = volume;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  function playBuffer() {
    if (!soundBuffer || !gainNode) {
      playFallback();
      return;
    }

    const context = getSharedAudioContext();
    if (!context) {
      playFallback();
      return;
    }

    const source = context.createBufferSource();
    source.buffer = soundBuffer;
    source.connect(gainNode);
    source.start(0);
  }

  function play() {
    if (!soundBuffer) {
      playFallback();
      void loadSound().then(() => {
        if (soundBuffer) {
          playBuffer();
        }
      });
      return;
    }

    const context = ensureContext();
    if (!context) {
      playFallback();
      return;
    }

    if (context.state === 'suspended') {
      void context.resume().then(playBuffer).catch(playFallback);
      return;
    }

    playBuffer();
  }

  async function unlock() {
    await unlockSharedAudioContext();
    if (!soundBuffer) {
      await loadSound();
    }
  }

  loadSound();

  return {
    play,
    unlock,
  };
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - ((-2 * value + 2) ** 3) / 2;
}

function drawCoverImage(ctx, image, width, height, parallaxY = 0) {
  if (!image?.complete || !image.naturalWidth) {
    return false;
  }

  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = width / height;
  let drawWidth;
  let drawHeight;
  let offsetX;
  let offsetY;

  if (imageRatio > canvasRatio) {
    drawHeight = height;
    drawWidth = height * imageRatio;
    offsetX = (width - drawWidth) / 2;
    offsetY = parallaxY;
  } else {
    drawWidth = width;
    drawHeight = width / imageRatio;
    offsetX = 0;
    offsetY = ((height - drawHeight) / 2) + parallaxY;
  }

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  return true;
}

function drawFallbackBackground(ctx, width, height, accent) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#0d3b66');
  gradient.addColorStop(0.55, '#1d6972');
  gradient.addColorStop(1, '#0b2530');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  drawGroundOverlay(ctx, width, height, DEFAULTS.groundHeight, accent);
}

function drawGroundOverlay(ctx, width, height, groundHeight, accent) {
  const floorY = height - groundHeight;
  const gradient = ctx.createLinearGradient(0, floorY - 24, 0, height);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(4, 12, 24, 0.82)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, floorY - 24, width, groundHeight + 24);

  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.65;
  ctx.fillRect(0, floorY, width, 2);
  ctx.globalAlpha = 1;
}

function drawScanlineOverlay(ctx, width, height, opacity = 0.1) {
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
  for (let y = 0; y < height; y += 4) {
    ctx.fillRect(0, y, width, 1);
  }
  ctx.restore();
}

function drawCyberParticles(ctx, x, height, progress) {
  const particleCount = 18;
  ctx.save();
  for (let index = 0; index < particleCount; index += 1) {
    const seed = index * 17.13;
    const y = (height / particleCount) * index + Math.sin(progress * 18 + seed) * 14;
    const size = 2 + (index % 3);
    const tone = index % 2 === 0 ? 'rgba(0, 210, 255, 0.9)' : 'rgba(192, 132, 252, 0.9)';
    ctx.fillStyle = tone;
    ctx.fillRect(x - 8 - (index % 4) * 3, y, size, size);
  }
  ctx.restore();
}

function drawFuturisticBackgroundTransition(ctx, width, height, fromImage, toImage, progress, parallax, accent) {
  const eased = easeInOutCubic(progress);
  const wipeX = width * eased;
  const glitch = Math.sin(progress * Math.PI * 10) * (1 - progress) * 22;
  const wipeEdge = clamp(wipeX + glitch, 0, width);

  // Fondo viejo a la derecha; el nuevo se revela a la izquierda conforme avanza la línea.
  drawCoverImage(ctx, fromImage, width, height, parallax);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, wipeEdge, height);
  ctx.clip();
  drawCoverImage(ctx, toImage, width, height, parallax * 1.08);
  ctx.restore();

  if (progress > 0.12 && progress < 0.88) {
    const bandHeight = 8 + Math.sin(progress * Math.PI * 6) * 4;
    ctx.save();
    ctx.globalAlpha = 0.22 * Math.sin(progress * Math.PI);
    ctx.fillStyle = 'rgba(0, 210, 255, 0.85)';
    ctx.fillRect(0, height * (0.2 + progress * 0.55), width, bandHeight);
    ctx.fillStyle = 'rgba(255, 110, 199, 0.65)';
    ctx.fillRect(0, height * (0.35 + progress * 0.35), width, bandHeight * 0.7);
    ctx.restore();
  }

  const beamX = wipeEdge;
  const beamGradient = ctx.createLinearGradient(beamX - 48, 0, beamX + 48, 0);
  beamGradient.addColorStop(0, 'rgba(0, 210, 255, 0)');
  beamGradient.addColorStop(0.42, 'rgba(0, 210, 255, 0.15)');
  beamGradient.addColorStop(0.5, 'rgba(0, 255, 255, 0.95)');
  beamGradient.addColorStop(0.58, 'rgba(192, 132, 252, 0.2)');
  beamGradient.addColorStop(1, 'rgba(192, 132, 252, 0)');
  ctx.fillStyle = beamGradient;
  ctx.fillRect(beamX - 56, 0, 112, height);

  drawCyberParticles(ctx, beamX, height, progress);
  drawScanlineOverlay(ctx, width, height, 0.08 + Math.sin(progress * Math.PI) * 0.08);

  if (progress > 0.05 && progress < 0.95) {
    ctx.save();
    ctx.globalAlpha = 0.18 * Math.sin(progress * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  drawGroundOverlay(ctx, width, height, DEFAULTS.groundHeight, accent);
}

function drawSceneBackground(ctx, width, height, layer, image, parallax, transitionState, images, now) {
  if (transitionState) {
    const progress = clamp(
      (now - transitionState.startedAt) / transitionState.duration,
      0,
      1,
    );
    drawFuturisticBackgroundTransition(
      ctx,
      width,
      height,
      images[transitionState.from],
      images[transitionState.to],
      progress,
      parallax,
      layer.accent,
    );
    return;
  }

  if (!drawCoverImage(ctx, image, width, height, parallax)) {
    drawFallbackBackground(ctx, width, height, layer.accent);
    return;
  }

  drawGroundOverlay(ctx, width, height, DEFAULTS.groundHeight, layer.accent);
}

function getPipeHitMetrics() {
  const hitWidth = DEFAULTS.pipeWidth * 0.56;
  const hitInset = (DEFAULTS.pipeWidth - hitWidth) / 2;
  return { hitWidth, hitInset };
}

function drawPillarColumn(ctx, x, y, columnHeight, columnWidth, pillarImage, flipped = false) {
  if (columnHeight <= 0) return;

  const padding = 4;
  const drawWidth = columnWidth - padding;
  const drawX = x + padding / 2;

  ctx.save();

  if (!pillarImage?.complete || !pillarImage.naturalWidth) {
    ctx.fillStyle = 'rgba(46, 196, 232, 0.35)';
    ctx.fillRect(drawX, y, drawWidth, columnHeight);
    ctx.restore();
    return;
  }

  const tileHeight = drawWidth * (pillarImage.naturalHeight / pillarImage.naturalWidth);
  const step = Math.max(tileHeight * 0.9, 48);

  if (flipped) {
    ctx.translate(drawX + drawWidth / 2, y + columnHeight);
    ctx.scale(1, -1);
    for (let offset = 0; offset < columnHeight; offset += step) {
      const segmentHeight = Math.min(tileHeight, columnHeight - offset);
      ctx.drawImage(pillarImage, -drawWidth / 2, offset, drawWidth, segmentHeight);
    }
  } else {
    for (let offset = 0; offset < columnHeight; offset += step) {
      const segmentTop = y + offset;
      const segmentHeight = Math.min(tileHeight, y + columnHeight - segmentTop);
      ctx.drawImage(pillarImage, drawX, segmentTop, drawWidth, segmentHeight);
    }
  }

  ctx.restore();
}

function drawStarBadge(ctx, star) {
  ctx.save();
  ctx.translate(star.x, star.y);
  ctx.rotate(star.spin);
  ctx.font = '22px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(star.collected ? '✨' : '⭐', 0, 0);
  ctx.restore();
}

function computeSpriteTrim(image) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  if (!width || !height) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 24) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const padX = Math.max(2, Math.round((maxX - minX + 1) * 0.03));
  const padY = Math.max(2, Math.round((maxY - minY + 1) * 0.03));

  return {
    sx: Math.max(0, minX - padX),
    sy: Math.max(0, minY - padY),
    sw: Math.min(width - Math.max(0, minX - padX), maxX - minX + 1 + padX * 2),
    sh: Math.min(height - Math.max(0, minY - padY), maxY - minY + 1 + padY * 2),
  };
}

function drawBird(ctx, bird, sprite, spriteTrim) {
  const { x, y, h } = bird;

  if (sprite?.complete && sprite.naturalWidth > 0) {
    const trim = spriteTrim || {
      sx: 0,
      sy: 0,
      sw: sprite.naturalWidth,
      sh: sprite.naturalHeight,
    };
    const aspect = trim.sw / trim.sh;
    const drawHeight = h;
    const drawWidth = drawHeight * aspect;
    const angle = clamp(bird.vy * 0.045, -0.32, 0.42);

    ctx.save();
    ctx.translate(x + drawWidth * 0.42, y);
    ctx.rotate(angle);
    ctx.drawImage(
      sprite,
      trim.sx,
      trim.sy,
      trim.sw,
      trim.sh,
      -drawWidth * 0.42,
      -drawHeight / 2,
      drawWidth,
      drawHeight,
    );
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#2ec4e8';
  ctx.beginPath();
  ctx.ellipse(x, y, 28, 18, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function createColibriFlappyGame(root, options = {}) {
  if (activeColibriGameInstance) {
    activeColibriGameInstance.destroy();
    activeColibriGameInstance = null;
  }

  if (root.dataset.colibriGameActive === 'true') {
    root.replaceChildren();
  }
  root.dataset.colibriGameActive = 'true';

  const shell = document.createElement('div');
  shell.className = 'colibri-flappy-shell';
  shell.style.position = 'absolute';
  shell.style.inset = '0';
  shell.style.width = '100%';
  shell.style.height = '100%';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'colibri-flappy-back';
  backButton.textContent = '← Menú';

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Fly mini juego');
  shell.append(backButton, canvas);
  root.replaceChildren(shell);

  const ctx = canvas.getContext('2d');
  const sprite = new Image();
  sprite.src = SPRITE_URL;
  let spriteTrim = null;

  const backgroundImages = BACKGROUND_LAYERS.map((layer) => {
    const image = new Image();
    image.src = layer.src;
    return image;
  });

  const pillarImages = PILLAR_TYPES.map((pillar) => {
    const image = new Image();
    image.src = pillar.src;
    return image;
  });

  const flapSound = createSoundPlayer(SOUNDS.flap, 0.8);
  const passSound = createSoundPlayer(SOUNDS.pass, 0.75);
  const loseSound = createSoundPlayer(SOUNDS.gameover, 0.85);
  let soundsUnlocked = false;

  let width = 360;
  let height = 640;
  let dpr = 1;
  let animationId = 0;
  let lastSpawn = 0;
  let lastFrameNow = performance.now();
  let paused = false;
  let mounted = true;
  let scoreSubmitted = false;
  let bgScroll = 0;

  const state = {
    mode: 'ready',
    score: 0,
    bonusScore: 0,
    best: loadBestScore(),
    bird: { x: 88, y: 0, vy: 0, w: 88, h: 50 },
    pipes: [],
    stars: [],
    displayedBgIndex: 0,
    bgTransition: null,
  };

  function getTotalScore() {
    return state.score + state.bonusScore;
  }

  function getTargetBgIndex() {
    return Math.floor(getTotalScore() / 20) % BACKGROUND_LAYERS.length;
  }

  function syncBackgroundToScore() {
    startBackgroundTransition(getTargetBgIndex());
  }

  function getActiveLayer() {
    const index = state.bgTransition ? state.bgTransition.to : getTargetBgIndex();
    return BACKGROUND_LAYERS[index];
  }

  function startBackgroundTransition(toIndex) {
    if (state.bgTransition || toIndex === state.displayedBgIndex) {
      return;
    }

    state.bgTransition = {
      from: state.displayedBgIndex,
      to: toIndex,
      startedAt: performance.now(),
      duration: BG_TRANSITION_MS,
    };
  }

  function updateBackgroundTransition(now) {
    if (!state.bgTransition) {
      return;
    }

    if (now - state.bgTransition.startedAt >= state.bgTransition.duration) {
      state.displayedBgIndex = state.bgTransition.to;
      state.bgTransition = null;

      const targetIndex = getTargetBgIndex();
      if (targetIndex !== state.displayedBgIndex) {
        startBackgroundTransition(targetIndex);
      }
    }
  }

  function getDifficultyMultiplier() {
    return 1 + getTargetBgIndex() * 0.09;
  }

  function getPlayAreaSize() {
    const bounds = shell.getBoundingClientRect();
    const mountBounds = root.parentElement?.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;

    let nextWidth = bounds.width > 2 ? bounds.width : (mountBounds?.width || viewportWidth);
    let nextHeight = bounds.height > 2 ? bounds.height : (mountBounds?.height || viewportHeight);

    return {
      width: Math.max(280, Math.round(nextWidth)),
      height: Math.max(420, Math.round(nextHeight)),
    };
  }

  function resize() {
    const size = getPlayAreaSize();
    width = size.width;
    height = size.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    resetBirdPosition(false);
  }

  function resetBirdPosition(resetVelocity = true) {
    state.bird.y = height * 0.42;
    if (resetVelocity) {
      state.bird.vy = 0;
    }
  }

  function resetGame() {
    state.mode = 'ready';
    state.score = 0;
    state.bonusScore = 0;
    state.pipes = [];
    state.stars = [];
    state.displayedBgIndex = 0;
    state.bgTransition = null;
    lastSpawn = 0;
    scoreSubmitted = false;
    bgScroll = 0;
    resetBirdPosition(true);
  }

  function randomPillarIndex() {
    const variants = PILLAR_SETS_BY_BG[getTargetBgIndex()] || PILLAR_SETS_BY_BG[0];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  function armSpawnTimer(now = performance.now()) {
    lastSpawn = now - DEFAULTS.spawnEveryMs;
  }

  function canSpawnPipe() {
    if (state.pipes.length >= DEFAULTS.maxPipes) {
      return false;
    }

    const trailingPipe = state.pipes[state.pipes.length - 1];
    if (trailingPipe && trailingPipe.x > width - DEFAULTS.minPipeSpacing) {
      return false;
    }

    return true;
  }

  function spawnPipe() {
    if (!canSpawnPipe()) {
      return false;
    }

    const minGapY = 120;
    const maxGapY = height - DEFAULTS.groundHeight - DEFAULTS.pipeGap - 120;
    const gapY = minGapY + Math.random() * Math.max(40, maxGapY - minGapY);
    const pillarIndex = randomPillarIndex();

    state.pipes.push({
      x: width + 20,
      gapY,
      passed: false,
      pillarIndex,
    });

    if (Math.random() < 0.45) {
      state.stars.push({
        x: width + 20 + DEFAULTS.pipeWidth + 36,
        y: gapY + DEFAULTS.pipeGap / 2,
        collected: false,
        spin: 0,
      });
    }

    return true;
  }

  function getBirdDrawMetrics() {
    const drawHeight = state.bird.h;

    if (spriteTrim) {
      const drawWidth = drawHeight * (spriteTrim.sw / spriteTrim.sh);
      return { drawWidth, drawHeight };
    }

    if (sprite.complete && sprite.naturalWidth > 0) {
      const drawWidth = drawHeight * (sprite.naturalWidth / sprite.naturalHeight);
      return { drawWidth, drawHeight };
    }

    return { drawWidth: state.bird.w, drawHeight };
  }

  function getBirdBox() {
    const { drawWidth, drawHeight } = getBirdDrawMetrics();
    const anchorX = state.bird.x + drawWidth * 0.42;
    const boxW = drawWidth * 0.5;
    const boxH = drawHeight * 0.46;

    return {
      x: anchorX - boxW * 0.54,
      y: state.bird.y - boxH * 0.46,
      w: boxW,
      h: boxH,
    };
  }

  function hitObstacle() {
    const birdBox = getBirdBox();
    const { hitWidth, hitInset } = getPipeHitMetrics();

    return state.pipes.some((pipe) => {
      const pipeX = pipe.x + hitInset;
      const overlapsX = birdBox.x + birdBox.w > pipeX && birdBox.x < pipeX + hitWidth;
      const hitsTop = birdBox.y < pipe.gapY;
      const hitsBottom = birdBox.y + birdBox.h > pipe.gapY + DEFAULTS.pipeGap;
      return overlapsX && (hitsTop || hitsBottom);
    });
  }

  function hitTest() {
    const birdBox = getBirdBox();
    if (birdBox.y <= 0 || birdBox.y + birdBox.h >= height - DEFAULTS.groundHeight) {
      return true;
    }
    return hitObstacle();
  }

  function collectStars() {
    const birdBox = getBirdBox();
    state.stars.forEach((star) => {
      if (star.collected) return;
      const overlapsX = birdBox.x + birdBox.w > star.x - 14 && birdBox.x < star.x + 14;
      const overlapsY = birdBox.y + birdBox.h > star.y - 14 && birdBox.y < star.y + 14;
      if (overlapsX && overlapsY) {
        star.collected = true;
        state.bonusScore += 1;
        syncBackgroundToScore();
        passSound.play();
      }
    });
  }

  function endGame() {
    state.mode = 'over';
    const totalScore = state.score + state.bonusScore;

    if (totalScore > state.best) {
      state.best = totalScore;
      saveBestScore(state.best);
    }

    if (!scoreSubmitted) {
      scoreSubmitted = true;
      options.onGameOver?.(totalScore);
    }
  }

  function flap() {
    flapSound.play();

    if (state.mode === 'ready') {
      state.mode = 'playing';
      state.bird.vy = DEFAULTS.flapVelocity;
      armSpawnTimer();
      return;
    }

    if (state.mode === 'over') {
      resetGame();
      state.mode = 'playing';
      state.bird.vy = DEFAULTS.flapVelocity;
      armSpawnTimer();
      return;
    }

    state.bird.vy = DEFAULTS.flapVelocity;
  }

  function update(now) {
    const speedMultiplier = getDifficultyMultiplier();
    bgScroll += DEFAULTS.pipeSpeed * 0.4 * speedMultiplier;
    updateBackgroundTransition(now);

    if (!state.bgTransition && getTargetBgIndex() !== state.displayedBgIndex) {
      syncBackgroundToScore();
    }

    if (state.mode !== 'playing') {
      if (state.mode === 'ready') {
        state.bird.y += Math.sin(now / 280) * 0.35;
      }
      return;
    }

    state.bird.vy += DEFAULTS.gravity;
    state.bird.vy = clamp(state.bird.vy, -9, 11);
    state.bird.y += state.bird.vy;

    if (now - lastSpawn >= DEFAULTS.spawnEveryMs && spawnPipe()) {
      lastSpawn = now;
    }

    state.pipes.forEach((pipe) => {
      pipe.x -= DEFAULTS.pipeSpeed * speedMultiplier;
      if (!pipe.passed && pipe.x + DEFAULTS.pipeWidth < state.bird.x) {
        pipe.passed = true;
        state.score += 1;
        syncBackgroundToScore();
        passSound.play();
      }
    });

    state.pipes = state.pipes.filter((pipe) => pipe.x + DEFAULTS.pipeWidth > -20);

    state.stars.forEach((star) => {
      star.x -= DEFAULTS.pipeSpeed * speedMultiplier;
      star.spin += 0.06;
    });
    state.stars = state.stars.filter((star) => star.x > -30);

    collectStars();

    if (hitTest()) {
      if (hitObstacle()) {
        loseSound.play();
      }
      endGame();
    }
  }

  function getHudTopInset() {
    const canvasTop = canvas.getBoundingClientRect().top;
    const backTop = backButton.getBoundingClientRect().top;
    const inferredSafeTop = Math.max(0, backTop - canvasTop - 12);
    const viewportTop = Math.max(0, window.visualViewport?.offsetTop || 0);

    return Math.max(inferredSafeTop, viewportTop, 44);
  }

  function getHudLayout() {
    const topInset = getHudTopInset();
    const scoreY = topInset + 52;
    const recordY = scoreY + 24;
    const campusY = recordY + 22;
    const hintY = campusY + 22;

    return { scoreY, recordY, campusY, hintY };
  }

  function drawHud(layer) {
    const totalScore = getTotalScore();
    const nextChangeIn = 20 - (totalScore % 20 || 20);
    const { scoreY, recordY, campusY, hintY } = getHudLayout();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 42px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(totalScore), width / 2, scoreY);

    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText(`RÉCORD ${state.best}`, width / 2, recordY);
    ctx.fillText(layer.name, width / 2, campusY);

    if (state.mode === 'playing' && nextChangeIn <= 6) {
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(46, 196, 232, 0.92)';
      ctx.fillText(`Nuevo mundo en ${nextChangeIn}`, width / 2, hintY);
    }

    if (state.mode === 'ready') {
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.fillStyle = '#e0f7fa';
      ctx.fillText('TOCA PARA VOLAR', width / 2, height * 0.58);
      ctx.font = '500 14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillText('Esquiva los postes del colegio', width / 2, height * 0.58 + 28);
      ctx.fillText('⭐ Recoge insignias Comergio', width / 2, height * 0.58 + 50);
    }

    if (state.mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, height * 0.34, width, 160);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 28px system-ui, sans-serif';
      ctx.fillText('GAME OVER', width / 2, height * 0.42);
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillStyle = '#e0f7fa';
      ctx.fillText('Toca para reintentar', width / 2, height * 0.48);
    }
  }

  function render(now = lastFrameNow) {
    const layer = getActiveLayer();
    const currentImage = backgroundImages[state.bgTransition ? state.bgTransition.from : state.displayedBgIndex];

    drawSceneBackground(
      ctx,
      width,
      height,
      layer,
      currentImage,
      -bgScroll * 0.06,
      state.bgTransition,
      backgroundImages,
      now,
    );

    state.pipes.forEach((pipe) => {
      const topHeight = pipe.gapY;
      const bottomY = pipe.gapY + DEFAULTS.pipeGap;
      const bottomHeight = height - DEFAULTS.groundHeight - bottomY;
      const pillarImage = pillarImages[pipe.pillarIndex];
      drawPillarColumn(ctx, pipe.x, 0, topHeight, DEFAULTS.pipeWidth, pillarImage, true);
      drawPillarColumn(ctx, pipe.x, bottomY, bottomHeight, DEFAULTS.pipeWidth, pillarImage, false);
    });

    state.stars.forEach((star) => drawStarBadge(ctx, star));
    drawBird(ctx, state.bird, sprite, spriteTrim);
    drawHud(layer);
  }

  function loop(now) {
    if (!mounted) return;
    lastFrameNow = now;
    if (!paused) {
      update(now);
      render();
    }
    animationId = window.requestAnimationFrame(loop);
  }

  function ensureSoundsUnlocked() {
    if (soundsUnlocked) {
      return;
    }

    soundsUnlocked = true;
    void unlockSharedAudioContext();
    void flapSound.unlock();
    void passSound.unlock();
    void loseSound.unlock();
  }

  function onPointerDown(event) {
    if (event.target === backButton) return;
    event.preventDefault();
    ensureSoundsUnlocked();
    flap();
  }

  function onKeyDown(event) {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault();
      ensureSoundsUnlocked();
      flap();
    }
  }

  backButton.addEventListener('click', () => {
    options.onExit?.();
  });

  shell.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', resize);

  sprite.addEventListener('load', () => {
    spriteTrim = computeSpriteTrim(sprite);
    if (mounted) {
      render();
    }
  });

  backgroundImages.forEach((image) => {
    image.addEventListener('load', () => {
      if (mounted) {
        render();
      }
    });
  });

  pillarImages.forEach((image) => {
    image.addEventListener('load', () => {
      if (mounted) {
        render();
      }
    });
  });

  resize();
  resetGame();
  animationId = window.requestAnimationFrame(loop);

  const gameApi = {
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    resize() {
      resize();
      render();
    },
    destroy() {
      mounted = false;
      window.cancelAnimationFrame(animationId);
      shell.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', resize);
      delete root.dataset.colibriGameActive;
      root.replaceChildren();
      if (activeColibriGameInstance === gameApi) {
        activeColibriGameInstance = null;
      }
    },
  };

  activeColibriGameInstance = gameApi;
  return gameApi;
}

export { BACKGROUND_LAYERS, PILLAR_TYPES, PILLAR_SETS_BY_BG, loadBestScore };
