require('dotenv').config();

const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const Product = require('../models/product.model');
const Category = require('../models/category.model');
const MeriendaSnack = require('../models/meriendaSnack.model');

const DEFAULT_FROM_DOMAIN = 'https://floralwhite-albatross-668675.hostingersite.com';
const DEFAULT_TO_DOMAIN = 'https://comergio.com';

function parseArgs(argv) {
  const args = {};

  for (const item of argv) {
    if (!item.startsWith('--')) {
      continue;
    }

    const [key, ...rest] = item.slice(2).split('=');
    args[key] = rest.length ? rest.join('=') : 'true';
  }

  return args;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function replaceDomainForField({ Model, label, field, from, to, apply }) {
  const query = {
    [field]: { $regex: escapeRegex(from) },
  };

  const matched = await Model.countDocuments(query);

  if (!apply || matched === 0) {
    return {
      label,
      field,
      matched,
      modified: 0,
    };
  }

  const result = await Model.updateMany(query, [
    {
      $set: {
        [field]: {
          $replaceAll: {
            input: `$${field}`,
            find: from,
            replacement: to,
          },
        },
      },
    },
  ]);

  return {
    label,
    field,
    matched,
    modified: Number(result?.modifiedCount || 0),
  };
}

async function migrateImageUrlDomain() {
  const args = parseArgs(process.argv.slice(2));
  const from = String(args.from || DEFAULT_FROM_DOMAIN).trim().replace(/\/+$/, '');
  const to = String(args.to || DEFAULT_TO_DOMAIN).trim().replace(/\/+$/, '');
  const apply = String(args.apply || 'false') === 'true';

  if (!from || !to) {
    throw new Error('Both --from and --to must be non-empty URLs.');
  }

  if (from === to) {
    throw new Error('--from and --to cannot be the same value.');
  }

  await connectDB();

  const targets = [
    { Model: Product, label: 'products', field: 'imageUrl' },
    { Model: Product, label: 'products', field: 'thumbUrl' },
    { Model: Category, label: 'categories', field: 'imageUrl' },
    { Model: Category, label: 'categories', field: 'thumbUrl' },
    { Model: MeriendaSnack, label: 'meriendaSnacks', field: 'imageUrl' },
  ];

  const rows = [];
  for (const target of targets) {
    // Run sequentially to keep migration logs deterministic.
    rows.push(
      await replaceDomainForField({
        ...target,
        from,
        to,
        apply,
      })
    );
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.matched += row.matched;
      acc.modified += row.modified;
      return acc;
    },
    { matched: 0, modified: 0 }
  );

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        from,
        to,
        totals,
        rows,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log('Dry-run only. Re-run with --apply=true to persist changes.');
  }

  await mongoose.connection.close();
}

migrateImageUrlDomain().catch(async (error) => {
  console.error('Image URL domain migration failed:', error.message || error);
  try {
    await mongoose.connection.close();
  } catch (_) {
    // Ignore close errors during failure handling.
  }
  process.exit(1);
});
