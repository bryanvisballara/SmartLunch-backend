const SOUND_DEFS = {
  intro: { files: ['/game/trivia/intro.m4a', '/game/trivia/intro.wav'], volume: 0.82 },
  spin: { files: ['/game/trivia/spin.m4a', '/game/trivia/spin.wav'], volume: 0.9 },
  categorySelected: {
    files: ['/game/trivia/category-selected.m4a', '/game/trivia/category-selected.wav'],
    volume: 0.92,
  },
  nextQuestion: {
    files: ['/game/trivia/next-question.m4a', '/game/trivia/next-question.wav'],
    volume: 0.92,
  },
  questionLoop: { files: ['/game/trivia/question-loop.m4a'], volume: 0.72, loop: true },
  correct: { files: ['/game/trivia/correct.m4a', '/game/trivia/correct.wav'], volume: 0.94 },
  wrongTimeout: {
    files: ['/game/trivia/wrong-timeout.m4a', '/game/trivia/wrong-timeout.wav'],
    volume: 0.94,
  },
  podium: { files: ['/game/trivia/podium.m4a', '/game/trivia/podium.wav'], volume: 0.9 },
};

const SOUND_KEYS = Object.keys(SOUND_DEFS);

let audioContext = null;
let unlocked = false;
const fetching = {};
const decoding = {};
const rawBuffers = {};
const decodedBuffers = {};
const voices = {};

function assetUrl(path) {
  const normalized = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${normalized}`;
  }
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${base}${normalized}`;
}

function getAudioContext() {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!audioContext) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) {
      return null;
    }
    audioContext = new Context();
  }
  return audioContext;
}

function playSilentTick(context) {
  if (!context) {
    return;
  }
  try {
    const buffer = context.createBuffer(1, 1, context.sampleRate || 44100);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
  } catch {
    // Unlock still proceeds via resume().
  }
}

function fetchSound(key) {
  if (rawBuffers[key]) {
    return Promise.resolve(rawBuffers[key]);
  }
  if (fetching[key]) {
    return fetching[key];
  }
  fetching[key] = (async () => {
    for (const file of SOUND_DEFS[key].files) {
      try {
        const response = await fetch(assetUrl(file), { cache: 'force-cache' });
        if (!response.ok) {
          continue;
        }
        rawBuffers[key] = await response.arrayBuffer();
        return rawBuffers[key];
      } catch {
        // Try the next format.
      }
    }
    return null;
  })();
  return fetching[key];
}

function decodeSound(key) {
  if (decodedBuffers[key]) {
    return Promise.resolve(decodedBuffers[key]);
  }
  if (decoding[key]) {
    return decoding[key];
  }
  decoding[key] = (async () => {
    const context = getAudioContext();
    if (!context) {
      return null;
    }
    for (const file of SOUND_DEFS[key].files) {
      try {
        const response = await fetch(assetUrl(file), { cache: 'force-cache' });
        if (!response.ok) {
          continue;
        }
        const raw = await response.arrayBuffer();
        const decoded = await context.decodeAudioData(raw.slice(0));
        rawBuffers[key] = raw;
        decodedBuffers[key] = decoded;
        return decoded;
      } catch {
        // Try the next format.
      }
    }
    return null;
  })();
  return decoding[key];
}

export function preloadTriviaAudio() {
  SOUND_KEYS.forEach((key) => {
    void fetchSound(key);
  });
  if (unlocked) {
    SOUND_KEYS.forEach((key) => {
      void decodeSound(key);
    });
  }
}

export function unlockTriviaAudio() {
  const context = getAudioContext();
  if (!context) {
    return Promise.resolve();
  }
  unlocked = true;
  playSilentTick(context);
  const resumed = context.state === 'running'
    ? Promise.resolve()
    : context.resume().catch(() => {});
  SOUND_KEYS.forEach((key) => {
    void decodeSound(key);
  });
  return resumed;
}

function stopVoice(key) {
  const voice = voices[key];
  if (!voice) {
    return;
  }
  try {
    voice.source.onended = null;
    voice.source.stop(0);
  } catch {
    // Already stopped.
  }
  try {
    voice.source.disconnect();
    voice.gain.disconnect();
  } catch {
    // Node already disconnected.
  }
  delete voices[key];
}

function isVoicePlaying(key) {
  return Boolean(voices[key]);
}

function startVoice(key, when = 0) {
  const context = getAudioContext();
  const buffer = decodedBuffers[key];
  if (!context || !buffer) {
    return;
  }
  stopVoice(key);
  const gain = context.createGain();
  gain.gain.value = SOUND_DEFS[key].volume;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = Boolean(SOUND_DEFS[key].loop);
  source.connect(gain);
  gain.connect(context.destination);
  source.onended = () => {
    if (voices[key]?.source === source) {
      delete voices[key];
    }
  };
  source.start(when);
  voices[key] = { source, gain };
}

async function playKey(key, { restart = true } = {}) {
  unlockTriviaAudio();
  if (!restart && isVoicePlaying(key)) {
    return;
  }
  await decodeSound(key);
  const context = getAudioContext();
  if (context?.state === 'suspended') {
    await context.resume().catch(() => {});
  }
  if (!context || !decodedBuffers[key]) {
    return;
  }
  startVoice(key, context.currentTime);
}

export function playTriviaHomeTheme({ restart = false } = {}) {
  return playKey('intro', { restart });
}

export function stopTriviaHomeTheme() {
  stopVoice('intro');
}

export function playTriviaSpinSound() {
  stopTriviaHomeTheme();
  return playKey('spin');
}

export function stopTriviaSpinSound() {
  stopVoice('spin');
}

export function stopTriviaCategorySelectedSound() {
  stopVoice('categorySelected');
}

export function playTriviaCategorySelectedSound() {
  stopTriviaHomeTheme();
  stopTriviaSpinSound();
  return playKey('categorySelected');
}

export function stopTriviaQuestionLoop() {
  stopVoice('questionLoop');
}

export function stopTriviaNextQuestionSound() {
  stopVoice('nextQuestion');
}

export function stopTriviaQuestionEntrance() {
  stopTriviaNextQuestionSound();
  stopTriviaQuestionLoop();
}

export function playTriviaQuestionEntrance() {
  stopTriviaHomeTheme();
  stopTriviaSpinSound();
  stopTriviaCategorySelectedSound();
  stopTriviaQuestionEntrance();
  unlockTriviaAudio();
  return Promise.all([decodeSound('nextQuestion'), decodeSound('questionLoop')]).then(async () => {
    const context = getAudioContext();
    if (context?.state === 'suspended') {
      await context.resume().catch(() => {});
    }
    if (!context) {
      return;
    }
    const when = context.currentTime;
    startVoice('nextQuestion', when);
    startVoice('questionLoop', when);
  });
}

export function playTriviaCorrectSound() {
  stopVoice('wrongTimeout');
  stopVoice('podium');
  stopTriviaQuestionEntrance();
  stopTriviaHomeTheme();
  return playKey('correct');
}

export function playTriviaWrongOrTimeoutSound() {
  stopVoice('correct');
  stopVoice('podium');
  stopTriviaQuestionEntrance();
  stopTriviaHomeTheme();
  return playKey('wrongTimeout');
}

export function playTriviaPodiumSound() {
  stopVoice('correct');
  stopVoice('wrongTimeout');
  stopTriviaSpinSound();
  stopTriviaQuestionEntrance();
  stopTriviaHomeTheme();
  return playKey('podium');
}

export function stopTriviaPodiumSound() {
  stopVoice('podium');
}

export function stopAllTriviaAudio() {
  SOUND_KEYS.forEach(stopVoice);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && unlocked && audioContext?.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
  });
}
