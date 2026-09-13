const HOME_THEME_SRC = '/game/trivia/intro.m4a';

function themeUrl() {
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${base}${HOME_THEME_SRC}`;
}

let sharedAudio = null;
let unlocked = false;

function getAudio() {
  if (!sharedAudio) {
    sharedAudio = new Audio(themeUrl());
    sharedAudio.preload = 'auto';
    sharedAudio.loop = false;
    sharedAudio.volume = 0.82;
  }
  return sharedAudio;
}

function unlockHomeTheme() {
  unlocked = true;
  const audio = getAudio();
  audio.muted = true;
  return audio.play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    })
    .catch(() => {
      audio.muted = false;
    });
}

export function playTriviaHomeTheme({ restart = false } = {}) {
  const audio = getAudio();
  if (!restart && !audio.paused && !audio.ended) {
    return Promise.resolve();
  }
  if (restart || audio.ended) {
    audio.currentTime = 0;
  }
  const start = () => audio.play().catch(() => {});
  if (!unlocked) {
    return unlockHomeTheme().then(start);
  }
  return start();
}

export function stopTriviaHomeTheme() {
  if (!sharedAudio) {
    return;
  }
  sharedAudio.pause();
  sharedAudio.currentTime = 0;
}

const SPIN_SRC = '/game/trivia/spin.m4a';

let spinAudio = null;

function spinUrl() {
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${base}${SPIN_SRC}`;
}

function getSpinAudio() {
  if (!spinAudio) {
    spinAudio = new Audio(spinUrl());
    spinAudio.preload = 'auto';
    spinAudio.loop = false;
    spinAudio.volume = 0.9;
  }
  return spinAudio;
}

export function playTriviaSpinSound() {
  stopTriviaHomeTheme();
  const audio = getSpinAudio();
  audio.currentTime = 0;
  return audio.play().catch(() => {});
}

export function stopTriviaSpinSound() {
  if (!spinAudio) {
    return;
  }
  spinAudio.pause();
  spinAudio.currentTime = 0;
}

const CATEGORY_SELECTED_SRC = '/game/trivia/category-selected.m4a';

let categorySelectedAudio = null;

function categorySelectedUrl() {
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${base}${CATEGORY_SELECTED_SRC}`;
}

function getCategorySelectedAudio() {
  if (!categorySelectedAudio) {
    categorySelectedAudio = new Audio(categorySelectedUrl());
    categorySelectedAudio.preload = 'auto';
    categorySelectedAudio.loop = false;
    categorySelectedAudio.volume = 0.92;
  }
  return categorySelectedAudio;
}

export function stopTriviaCategorySelectedSound() {
  if (!categorySelectedAudio) {
    return;
  }
  categorySelectedAudio.pause();
  categorySelectedAudio.currentTime = 0;
}

export function playTriviaCategorySelectedSound() {
  stopTriviaHomeTheme();
  stopTriviaSpinSound();
  const audio = getCategorySelectedAudio();
  audio.currentTime = 0;
  return audio.play().catch(() => {});
}

const NEXT_QUESTION_SRC = '/game/trivia/next-question.m4a';
const QUESTION_LOOP_SRC = '/game/trivia/question-loop.m4a';

let nextQuestionAudio = null;
let questionLoopAudio = null;

function assetUrl(path) {
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${base}${path}`;
}

function getNextQuestionAudio() {
  if (!nextQuestionAudio) {
    nextQuestionAudio = new Audio(assetUrl(NEXT_QUESTION_SRC));
    nextQuestionAudio.preload = 'auto';
    nextQuestionAudio.loop = false;
    nextQuestionAudio.volume = 0.92;
  }
  return nextQuestionAudio;
}

function getQuestionLoopAudio() {
  if (!questionLoopAudio) {
    questionLoopAudio = new Audio(assetUrl(QUESTION_LOOP_SRC));
    questionLoopAudio.preload = 'auto';
    questionLoopAudio.loop = true;
    questionLoopAudio.volume = 0.72;
  }
  return questionLoopAudio;
}

export function stopTriviaQuestionLoop() {
  if (!questionLoopAudio) {
    return;
  }
  questionLoopAudio.pause();
  questionLoopAudio.currentTime = 0;
}

export function stopTriviaNextQuestionSound() {
  if (!nextQuestionAudio) {
    return;
  }
  nextQuestionAudio.pause();
  nextQuestionAudio.currentTime = 0;
}

export function stopTriviaQuestionEntrance() {
  stopTriviaNextQuestionSound();
  stopTriviaQuestionLoop();
}

export function playTriviaQuestionEntrance() {
  stopTriviaHomeTheme();
  stopTriviaSpinSound();
  stopTriviaQuestionEntrance();
  const oneshot = getNextQuestionAudio();
  oneshot.currentTime = 0;
  const loop = getQuestionLoopAudio();
  loop.currentTime = 0;
  return Promise.all([
    oneshot.play().catch(() => {}),
    loop.play().catch(() => {}),
  ]);
}

function createOneShot(src, volume = 0.92) {
  let audio = null;
  return {
    play() {
      stopTriviaHomeTheme();
      stopTriviaQuestionEntrance();
      if (!audio) {
        audio = new Audio(assetUrl(src));
        audio.preload = 'auto';
        audio.loop = false;
        audio.volume = volume;
      }
      audio.currentTime = 0;
      return audio.play().catch(() => {});
    },
    stop() {
      if (!audio) {
        return;
      }
      audio.pause();
      audio.currentTime = 0;
    },
  };
}

const correctSound = createOneShot('/game/trivia/correct.m4a', 0.94);
const wrongTimeoutSound = createOneShot('/game/trivia/wrong-timeout.m4a', 0.94);
const podiumSound = createOneShot('/game/trivia/podium.m4a', 0.9);

export function playTriviaCorrectSound() {
  wrongTimeoutSound.stop();
  podiumSound.stop();
  return correctSound.play();
}

export function playTriviaWrongOrTimeoutSound() {
  correctSound.stop();
  podiumSound.stop();
  return wrongTimeoutSound.play();
}

export function playTriviaPodiumSound() {
  correctSound.stop();
  wrongTimeoutSound.stop();
  stopTriviaSpinSound();
  return podiumSound.play();
}

export function stopTriviaPodiumSound() {
  podiumSound.stop();
}

export function stopAllTriviaAudio() {
  stopTriviaHomeTheme();
  stopTriviaSpinSound();
  stopTriviaCategorySelectedSound();
  stopTriviaQuestionEntrance();
  correctSound.stop();
  wrongTimeoutSound.stop();
  podiumSound.stop();
}
