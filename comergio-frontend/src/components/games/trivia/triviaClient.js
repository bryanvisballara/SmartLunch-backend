const REQUIRED_METHODS = [
  'getStudentTriviaState',
  'saveTriviaProfile',
  'createTriviaMatch',
  'listTriviaSubjects',
  'respondToTriviaInvite',
  'updateTriviaLobby',
  'startTriviaMatch',
  'chooseTriviaSubject',
  'submitTriviaAnswer',
  'blockTriviaCandidate',
  'reportTriviaCandidate',
  'leaveTriviaMatch',
];

function missingMethod(name) {
  return async () => {
    throw new Error(`Trivia API method not configured: ${name}`);
  };
}

/**
 * Small adapter for the future studentPortal.service trivia endpoints.
 * Pass that service module (or a test double) to TriviaStudentPanel as `api`.
 */
export function createTriviaClient(api = {}) {
  return REQUIRED_METHODS.reduce((client, name) => {
    client[name] = typeof api[name] === 'function' ? api[name].bind(api) : missingMethod(name);
    return client;
  }, {});
}

export const TRIVIA_API_METHODS = Object.freeze([...REQUIRED_METHODS]);
