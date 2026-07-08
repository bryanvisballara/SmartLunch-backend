const { listTenantSchoolContexts, runWithSchoolContext } = require('../config/db');
const { getSchoolDisplayName, normalizeText } = require('../utils/schoolDisplayName');
const ColibriGameScore = require('../models/colibriGameScore.model');

function titleCaseWord(value) {
  const word = normalizeText(value);
  if (!word) {
    return '';
  }

  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function formatColibriShortPlayerName(fullName) {
  const parts = normalizeText(fullName).split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return 'Jugador';
  }

  if (parts.length === 1) {
    return titleCaseWord(parts[0]);
  }

  return `${titleCaseWord(parts[0])} ${titleCaseWord(parts[1])}`;
}

function formatColibriLeaderboardLabel(playerName, schoolName) {
  const shortName = formatColibriShortPlayerName(playerName);
  const label = normalizeText(schoolName);
  return label ? `${shortName} - ${label}` : shortName;
}

function serializeColibriLeaderboardEntry(entry, rank) {
  return {
    rank,
    playerName: formatColibriLeaderboardLabel(entry?.playerName, entry?.schoolName),
    score: Number(entry?.score || 0),
    createdAt: entry?.createdAt || null,
  };
}

function buildColibriPlayerKeyExpression() {
  return {
    $cond: [
      { $ifNull: ['$userId', false] },
      { $concat: ['user:', { $toString: '$userId' }] },
      { $concat: ['name:', { $toLower: { $trim: { input: '$playerName' } } }] },
    ],
  };
}

async function collectBestScoresForSchool(schoolId) {
  return runWithSchoolContext(schoolId, async () => {
    const schoolName = await getSchoolDisplayName(schoolId);
    const entries = await ColibriGameScore.aggregate([
      { $sort: { score: -1, createdAt: -1 } },
      {
        $group: {
          _id: buildColibriPlayerKeyExpression(),
          playerName: { $first: '$playerName' },
          schoolName: { $first: '$schoolName' },
          userId: { $first: '$userId' },
          score: { $first: '$score' },
          createdAt: { $first: '$createdAt' },
        },
      },
    ]);

    return entries.map((entry) => ({
      schoolId,
      schoolName: normalizeText(entry.schoolName) || schoolName,
      playerName: entry.playerName,
      userId: entry.userId,
      score: Number(entry.score || 0),
      createdAt: entry.createdAt || null,
      playerKey: `${schoolId}:${String(entry._id || '')}`,
    }));
  });
}

async function loadGlobalColibriLeaderboard(limit = 50) {
  const tenantContexts = await listTenantSchoolContexts();
  const mergedEntries = [];

  for (const tenantContext of tenantContexts) {
    const schoolEntries = await collectBestScoresForSchool(tenantContext.schoolId);
    mergedEntries.push(...schoolEntries);
  }

  return mergedEntries
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
    })
    .slice(0, limit)
    .map((entry, index) => serializeColibriLeaderboardEntry(entry, index + 1));
}

async function submitColibriGameScoreForUser({ schoolId, userId, userName, score }) {
  const normalizedScore = Number.parseInt(String(score ?? ''), 10);
  if (!Number.isFinite(normalizedScore) || normalizedScore < 0) {
    const error = new Error('Puntaje inválido');
    error.statusCode = 400;
    throw error;
  }

  const playerName = normalizeText(userName);
  if (!playerName) {
    const error = new Error('Nombre de jugador requerido');
    error.statusCode = 400;
    throw error;
  }

  return runWithSchoolContext(schoolId, async () => {
    const schoolName = await getSchoolDisplayName(schoolId);
    const normalizedName = playerName.slice(0, 80);
    const playerFilter = userId
      ? { schoolId, userId }
      : {
        schoolId,
        userId: null,
        playerName: { $regex: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      };

    const existingBest = await ColibriGameScore.findOne(playerFilter).sort({ score: -1, createdAt: -1 });

    if (existingBest && normalizedScore <= existingBest.score) {
      return {
        statusCode: 200,
        entry: serializeColibriLeaderboardEntry({
          ...existingBest.toObject(),
          schoolName: existingBest.schoolName || schoolName,
        }, null),
      };
    }

    let entry;

    if (existingBest) {
      existingBest.score = normalizedScore;
      existingBest.playerName = normalizedName;
      existingBest.schoolName = schoolName;
      entry = await existingBest.save();
      await ColibriGameScore.deleteMany({
        ...playerFilter,
        _id: { $ne: entry._id },
      });
    } else {
      entry = await ColibriGameScore.create({
        schoolId,
        userId: userId || null,
        playerName: normalizedName,
        schoolName,
        score: normalizedScore,
      });
    }

    return {
      statusCode: 201,
      entry: serializeColibriLeaderboardEntry(entry.toObject(), null),
    };
  });
}

module.exports = {
  formatColibriLeaderboardLabel,
  formatColibriShortPlayerName,
  loadGlobalColibriLeaderboard,
  serializeColibriLeaderboardEntry,
  submitColibriGameScoreForUser,
};
