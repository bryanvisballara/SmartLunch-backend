const ARENA_HOST_SOUNDS = {
  questionLoop: '/game/arena/question-loop.m4a',
  gameStart: '/game/arena/game-start.m4a',
  nextQuestion: '/game/arena/next-question.m4a',
  timeUp: '/game/arena/time-up.m4a',
  socialize: '/game/arena/socialize.m4a',
  revealAnswer: '/game/arena/reveal-answer.m4a',
  podium: '/game/arena/podium.m4a',
};

export const ARENA_GAME_START_MS = 5480;
export const ARENA_TIME_UP_MS = 1280;

function arenaSoundUrl(path) {
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${base}${path}`;
}

function createAudioElement(src, { loop = false, volume = 0.78 } = {}) {
  const audio = new Audio(arenaSoundUrl(src));
  audio.loop = loop;
  audio.preload = 'auto';
  audio.volume = volume;
  return audio;
}

let sharedHostAudio = null;

export function getArenaHostAudio() {
  if (!sharedHostAudio) {
    sharedHostAudio = createArenaHostAudio();
  }
  return sharedHostAudio;
}

export function createArenaHostAudio() {
  let loop = null;
  let loopSrc = '';
  const oneshots = new Set();
  let unlocked = false;

  function stopLoop() {
    if (!loop) {
      return;
    }
    loop.pause();
    loop.currentTime = 0;
    loop = null;
    loopSrc = '';
  }

  function stopOneShots() {
    oneshots.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    oneshots.clear();
  }

  function playLoop(src, volume = 0.62) {
    if (loop && loopSrc === src && !loop.paused) {
      return Promise.resolve();
    }
    stopLoop();
    const audio = createAudioElement(src, { loop: true, volume });
    loop = audio;
    loopSrc = src;
    return audio.play().catch(() => {});
  }

  function playOneShot(src, volume = 0.92) {
    const audio = createAudioElement(src, { loop: false, volume });
    oneshots.add(audio);
    const finished = new Promise((resolve) => {
      audio.addEventListener('ended', () => {
        oneshots.delete(audio);
        resolve();
      }, { once: true });
      audio.addEventListener('error', () => {
        oneshots.delete(audio);
        resolve();
      }, { once: true });
    });
    return audio.play().then(() => finished).catch(() => {});
  }

  return {
    sounds: ARENA_HOST_SOUNDS,
    preload() {
      Object.values(ARENA_HOST_SOUNDS).forEach((src) => {
        const audio = createAudioElement(src);
        audio.load();
      });
    },
    unlock() {
      if (unlocked) {
        return;
      }
      unlocked = true;
      if (loop && loop.paused) {
        loop.play().catch(() => {});
      }
    },
    playQuestionLoop() {
      return playLoop(ARENA_HOST_SOUNDS.questionLoop, 0.58);
    },
    playSocializeLoop() {
      return playLoop(ARENA_HOST_SOUNDS.socialize, 0.6);
    },
    playGameStart() {
      stopLoop();
      return playOneShot(ARENA_HOST_SOUNDS.gameStart);
    },
    playQuestionStart() {
      playOneShot(ARENA_HOST_SOUNDS.nextQuestion);
      return playLoop(ARENA_HOST_SOUNDS.questionLoop, 0.58);
    },
    playTimeUp() {
      stopLoop();
      return playOneShot(ARENA_HOST_SOUNDS.timeUp);
    },
    playRevealAnswer() {
      return playOneShot(ARENA_HOST_SOUNDS.revealAnswer);
    },
    playPodium() {
      stopLoop();
      return playOneShot(ARENA_HOST_SOUNDS.podium, 0.78);
    },
    stopAll() {
      stopLoop();
      stopOneShots();
    },
  };
}
