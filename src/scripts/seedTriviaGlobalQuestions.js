require('dotenv').config({ override: true });

const { connectDB, runInControlDb } = require('../config/db');
require('../models');
const { TriviaGlobalQuestion } = require('../models/triviaQuestion.model');
const {
  AGE_BANDS,
  CATEGORIES,
  buildGlobalTriviaQuestions,
} = require('./triviaGlobalQuestionBank');

const QUESTIONS = buildGlobalTriviaQuestions();

async function main() {
  await connectDB();
  const result = await runInControlDb(async () => {
    let inserted = 0;
    let updated = 0;
    for (const item of QUESTIONS) {
      const operation = await TriviaGlobalQuestion.updateOne(
        { prompt: item.prompt, category: item.category, ageBand: item.ageBand },
        {
          $set: {
            ...item,
            subjectKey: item.category,
            subjectLabel: item.category,
            gradeKey: item.ageBand,
            gradeLabel: item.ageBand,
            status: 'published',
            moderationStatus: 'approved',
          },
          $setOnInsert: { createdByUserId: 'comergio-global-seed' },
        },
        { upsert: true }
      );
      inserted += Number(operation.upsertedCount || 0);
      updated += Number(operation.modifiedCount || 0);
    }
    const keepKeys = new Set(QUESTIONS.map((item) => `${item.ageBand}|${item.category}|${item.prompt}`));
    const publishedSeed = await TriviaGlobalQuestion.find({
      createdByUserId: 'comergio-global-seed',
      status: { $in: ['published', 'active'] },
    }).select('ageBand category prompt').lean();
    const staleIds = publishedSeed
      .filter((doc) => !keepKeys.has(`${doc.ageBand}|${doc.category}|${doc.prompt}`))
      .map((doc) => doc._id);
    const stale = staleIds.length
      ? await TriviaGlobalQuestion.updateMany({ _id: { $in: staleIds } }, { $set: { status: 'archived' } })
      : { modifiedCount: 0 };
    const archivedEasy = await TriviaGlobalQuestion.updateMany(
      { difficulty: 'easy', status: { $in: ['published', 'active'] } },
      { $set: { status: 'archived' } }
    );
    return {
      inserted,
      updated,
      archivedStale: Number(stale.modifiedCount || 0),
      archivedEasy: Number(archivedEasy.modifiedCount || 0),
      total: QUESTIONS.length,
    };
  });
  const coverage = {};
  AGE_BANDS.forEach((ageBand) => {
    coverage[ageBand] = Object.fromEntries(CATEGORIES.map((category) => [
      category,
      QUESTIONS.filter((item) => item.category === category && item.ageBand === ageBand).length,
    ]));
  });
  console.log(JSON.stringify({ ...result, coverage }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
