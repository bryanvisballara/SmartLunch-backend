require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const Student = require('../models/student.model');
const Wallet = require('../models/wallet.model');

function parseArgs(argv) {
  const args = {};

  for (const item of argv) {
    if (!item.startsWith('--')) {
      continue;
    }

    const [key, ...rest] = item.slice(2).split('=');
    const value = rest.length > 0 ? rest.join('=') : 'true';
    args[key] = value;
  }

  return args;
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseCsv(text, delimiter) {
  const rows = [];
  let current = '';
  let line = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      line.push(current);
      current = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      line.push(current);
      const hasAnyValue = line.some((cell) => String(cell || '').trim() !== '');
      if (hasAnyValue) {
        rows.push(line);
      }
      line = [];
      current = '';
      continue;
    }

    current += char;
  }

  line.push(current);
  const hasAnyValue = line.some((cell) => String(cell || '').trim() !== '');
  if (hasAnyValue) {
    rows.push(line);
  }

  return rows;
}

function detectDelimiter(text) {
  const firstLine = String(text || '').split(/\r?\n/).find((line) => line.trim().length > 0) || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;

  if (tabs >= commas && tabs >= semicolons) {
    return '\t';
  }

  return semicolons > commas ? ';' : ',';
}

function parseBalance(raw) {
  const input = String(raw || '').trim();
  if (!input) {
    return 0;
  }

  let cleaned = input.replace(/\s+/g, '').replace(/\$/g, '');

  // Colombian exports commonly use dots as thousand separators, e.g. 71.600
  if (cleaned.includes('.') && !cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '');
  } else if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeStudentName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function resolveColumnIndexes(headerRow) {
  const normalizedHeaders = headerRow.map((cell) => normalizeHeader(cell));

  const candidateMap = {
    name: ['alumno', 'nombre', 'nombrealumno', 'student', 'studentname'],
    grade: ['curso', 'grado', 'grade'],
    balance: [
      'saldoencreditos',
      'saldoencredito',
      'saldoencuenta',
      'saldo',
      'saldocreditos',
      'creditos',
      'balance',
      'saldoencreditoscop',
    ],
  };

  const findIndex = (keys) => normalizedHeaders.findIndex((header) => keys.includes(header));

  const indexes = {
    name: findIndex(candidateMap.name),
    grade: findIndex(candidateMap.grade),
    balance: findIndex(candidateMap.balance),
  };

  if (indexes.name < 0) {
    throw new Error('No se encontro la columna de alumno/nombre en el archivo.');
  }

  if (indexes.balance < 0) {
    throw new Error('No se encontro la columna de saldo en el archivo.');
  }

  return indexes;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const fileArg = args.file || args.input;
  const schoolId = String(args.schoolId || '').trim();
  const mode = String(args.mode || 'set').trim().toLowerCase();
  const dryRun = String(args.dryRun || 'false').toLowerCase() === 'true';

  if (!fileArg) {
    throw new Error('Debes enviar --file=RUTA_AL_ARCHIVO.csv');
  }

  if (!schoolId) {
    throw new Error('Debes enviar --schoolId=ID_DEL_COLEGIO');
  }

  if (!['set', 'increment'].includes(mode)) {
    throw new Error('El parametro --mode solo permite: set | increment');
  }

  const absolutePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Archivo no encontrado: ${absolutePath}`);
  }

  const rawFile = fs.readFileSync(absolutePath, 'utf8');
  const delimiter = args.delimiter || detectDelimiter(rawFile);
  const matrix = parseCsv(rawFile, delimiter);

  if (matrix.length < 2) {
    throw new Error('El archivo no tiene filas de datos.');
  }

  const header = matrix[0];
  const rows = matrix.slice(1);
  const indexes = resolveColumnIndexes(header);

  await connectDB();

  const summary = {
    totalRows: rows.length,
    createdStudents: 0,
    updatedStudents: 0,
    createdWallets: 0,
    updatedWallets: 0,
    skippedRows: 0,
    duplicateNameRows: 0,
    errors: 0,
  };

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];

    try {
      const name = normalizeStudentName(row[indexes.name]);
      const grade = indexes.grade >= 0 ? String(row[indexes.grade] || '').trim() : '';
      const balance = parseBalance(row[indexes.balance]);

      if (!name) {
        summary.skippedRows += 1;
        continue;
      }

      const duplicateMatches = await Student.find({
        schoolId,
        deletedAt: null,
        name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      })
        .select('_id name')
        .lean();

      if (duplicateMatches.length > 1) {
        summary.duplicateNameRows += 1;
        summary.skippedRows += 1;
        // Skip ambiguous cases so the migration does not touch wrong student records.
        continue;
      }

      let student = null;
      if (duplicateMatches.length === 1) {
        const studentId = duplicateMatches[0]._id;

        if (!dryRun) {
          student = await Student.findOneAndUpdate(
            { _id: studentId, schoolId, deletedAt: null },
            { $set: { grade } },
            { new: true }
          );
        } else {
          student = duplicateMatches[0];
        }

        summary.updatedStudents += 1;
      } else {
        if (!dryRun) {
          student = await Student.create({
            schoolId,
            name,
            grade,
            schoolCode: '',
            dailyLimit: 0,
            blockedProducts: [],
            blockedCategories: [],
            status: 'active',
          });
        } else {
          student = { _id: new mongoose.Types.ObjectId() };
        }

        summary.createdStudents += 1;
      }

      const wallet = await Wallet.findOne({ schoolId, studentId: student._id }).select('_id balance').lean();

      if (!wallet) {
        if (!dryRun) {
          await Wallet.create({
            schoolId,
            studentId: student._id,
            balance,
            status: 'active',
          });
        }
        summary.createdWallets += 1;
      } else {
        const nextBalance = mode === 'increment' ? Number(wallet.balance || 0) + balance : balance;

        if (!dryRun) {
          await Wallet.updateOne({ _id: wallet._id }, { $set: { balance: nextBalance } });
        }
        summary.updatedWallets += 1;
      }
    } catch (rowError) {
      summary.errors += 1;
      console.error(`[MIGRATION_ROW_ERROR] row=${rowIndex + 2} message=${rowError.message}`);
    }
  }

  console.info('[MIGRATION_SUMMARY]', summary);
}

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[MIGRATION_FAILED]', error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
