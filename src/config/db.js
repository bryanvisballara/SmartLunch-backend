const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { AsyncLocalStorage } = require('async_hooks');

const schoolContextStorage = new AsyncLocalStorage();
const schoolConnectionCache = new Map();
const schoolModelRegistry = new Map();
const schoolModelProxyCache = new Map();
const RESERVED_DATABASE_NAMES = new Set(['admin', 'local', 'config', 'test']);
const DEFAULT_CONTROL_DB_SCHOOL_IDS = [
  'International Berckley School',
  'international_berckley_school',
];

function normalizeSchoolId(value) {
  return String(value || '').trim();
}

function slugifySchoolId(value) {
  return normalizeSchoolId(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown_school';
}

function getControlDbName() {
  return normalizeSchoolId(process.env.MONGO_DB_NAME) || undefined;
}

function getControlDbSchoolIds() {
  return new Set(
    [
      ...DEFAULT_CONTROL_DB_SCHOOL_IDS,
      ...String(process.env.CONTROL_DB_SCHOOL_IDS || '')
        .split(',')
        .map((schoolId) => schoolId.trim())
        .filter(Boolean),
    ].map((schoolId) => normalizeSchoolId(schoolId).toLowerCase())
  );
}

function shouldUseControlDbForSchool(schoolId) {
  const normalizedSchoolId = normalizeSchoolId(schoolId);
  if (!normalizedSchoolId) {
    return true;
  }

  const controlSchoolIds = getControlDbSchoolIds();
  return controlSchoolIds.has(normalizedSchoolId.toLowerCase())
    || controlSchoolIds.has(slugifySchoolId(normalizedSchoolId).toLowerCase());
}

function getCurrentSchoolId() {
  return normalizeSchoolId(schoolContextStorage.getStore()?.schoolId);
}

function runWithSchoolContext(schoolId, callback) {
  const normalizedSchoolId = normalizeSchoolId(schoolId);
  if (!normalizedSchoolId) {
    return callback();
  }

  return schoolContextStorage.run({ schoolId: normalizedSchoolId }, callback);
}

function runInControlDb(callback) {
  return schoolContextStorage.run({}, callback);
}

function extractSchoolIdFromBearerToken(req) {
  const header = String(req?.headers?.authorization || '').trim();
  const [, token] = header.split(' ');
  if (!token || !process.env.JWT_SECRET) {
    return '';
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return normalizeSchoolId(decoded?.schoolId);
  } catch (error) {
    return '';
  }
}

function extractSchoolIdFromRequest(req) {
  const candidates = [
    req?.headers?.['x-school-id'],
    req?.user?.schoolId,
    req?.body?.schoolId,
    req?.query?.schoolId,
    req?.params?.schoolId,
    extractSchoolIdFromBearerToken(req),
  ];

  for (const candidate of candidates) {
    const normalizedSchoolId = normalizeSchoolId(candidate);
    if (normalizedSchoolId) {
      return normalizedSchoolId;
    }
  }

  return '';
}

async function connectDB() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(mongoUri, {
    dbName: getControlDbName(),
  });

  return mongoose.connection;
}

function ensureRootConnection() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB connection is not ready');
  }

  return mongoose.connection;
}

function resolveSchoolDbName(schoolId) {
  return slugifySchoolId(schoolId);
}

function getSchoolConnection(schoolId) {
  const normalizedSchoolId = normalizeSchoolId(schoolId);
  if (!normalizedSchoolId || shouldUseControlDbForSchool(normalizedSchoolId)) {
    return ensureRootConnection();
  }

  const dbName = resolveSchoolDbName(normalizedSchoolId);
  if (schoolConnectionCache.has(dbName)) {
    return schoolConnectionCache.get(dbName);
  }

  const connection = ensureRootConnection().useDb(dbName, { useCache: true });
  schoolConnectionCache.set(dbName, connection);
  return connection;
}

function getRegisteredModelNames() {
  return [...schoolModelRegistry.keys()].sort((left, right) => left.localeCompare(right));
}

function ensureRegisteredModelsForConnection(connection) {
  for (const [modelName, metadata] of schoolModelRegistry.entries()) {
    if (connection.models[modelName]) {
      continue;
    }

    if (metadata.collectionName) {
      connection.model(modelName, metadata.schema, metadata.collectionName);
    } else {
      connection.model(modelName, metadata.schema);
    }
  }
}

function resolveRegisteredModel(modelName, explicitSchoolId = '') {
  const metadata = schoolModelRegistry.get(modelName);
  if (!metadata) {
    throw new Error(`Model ${modelName} is not registered`);
  }

  const schoolId = normalizeSchoolId(explicitSchoolId || getCurrentSchoolId());
  const connection = schoolId ? getSchoolConnection(schoolId) : ensureRootConnection();

  ensureRegisteredModelsForConnection(connection);

  if (connection.models[modelName]) {
    return connection.model(modelName);
  }

  if (metadata.collectionName) {
    return connection.model(modelName, metadata.schema, metadata.collectionName);
  }

  return connection.model(modelName, metadata.schema);
}

function createModelProxy(modelName) {
  if (schoolModelProxyCache.has(modelName)) {
    return schoolModelProxyCache.get(modelName);
  }

  const proxyTarget = function SchoolScopedModel(doc) {
    const Model = resolveRegisteredModel(modelName);
    return new Model(doc);
  };

  const proxy = new Proxy(proxyTarget, {
    apply(_target, thisArg, args) {
      const Model = resolveRegisteredModel(modelName);
      return Reflect.apply(Model, thisArg, args);
    },
    construct(_target, args) {
      const Model = resolveRegisteredModel(modelName);
      return Reflect.construct(Model, args);
    },
    get(_target, property) {
      if (property === '__isSchoolScopedModelProxy') {
        return true;
      }

      if (property === 'modelName') {
        return modelName;
      }

      const Model = resolveRegisteredModel(modelName);
      const value = Reflect.get(Model, property);
      return typeof value === 'function' ? value.bind(Model) : value;
    },
    set(_target, property, value) {
      const Model = resolveRegisteredModel(modelName);
      Reflect.set(Model, property, value);
      return true;
    },
    getOwnPropertyDescriptor(_target, property) {
      const Model = resolveRegisteredModel(modelName);
      return Object.getOwnPropertyDescriptor(Model, property);
    },
    ownKeys() {
      const Model = resolveRegisteredModel(modelName);
      return Reflect.ownKeys(Model);
    },
    has(_target, property) {
      const Model = resolveRegisteredModel(modelName);
      return property in Model;
    },
  });

  schoolModelProxyCache.set(modelName, proxy);
  return proxy;
}

function registerSchoolScopedModel(modelName, schema) {
  if (!schoolModelRegistry.has(modelName)) {
    schoolModelRegistry.set(modelName, {
      schema,
      collectionName: schema.get('collection') || undefined,
    });
  }

  return createModelProxy(modelName);
}

async function listTenantSchoolContexts() {
  await connectDB();

  const admin = mongoose.connection.db.admin();
  const databases = await admin.listDatabases();
  const controlDbName = getControlDbName();
  const tenantContexts = [];
  const seenSchoolIds = new Set();

  for (const database of databases.databases || []) {
    const dbName = normalizeSchoolId(database?.name);
    if (!dbName || RESERVED_DATABASE_NAMES.has(dbName) || dbName === controlDbName) {
      continue;
    }

    const db = mongoose.connection.client.db(dbName);
    const [userSchoolIds, snapshotSchoolIds] = await Promise.all([
      db.collection('users').distinct('schoolId', {
        schoolId: { $type: 'string', $ne: '' },
      }),
      db.collection('schoolcreationsnapshots').distinct('schoolId', {
        schoolId: { $type: 'string', $ne: '' },
      }).catch(() => []),
    ]);

    const schoolIds = [...new Set(
      [...userSchoolIds, ...snapshotSchoolIds]
        .map(normalizeSchoolId)
        .filter(Boolean),
    )];

    for (const schoolId of schoolIds) {
      if (seenSchoolIds.has(schoolId)) {
        continue;
      }

      seenSchoolIds.add(schoolId);
      tenantContexts.push({ schoolId, dbName });
    }
  }

  return tenantContexts.sort((left, right) => left.schoolId.localeCompare(right.schoolId));
}

async function findOneAcrossTenantSchoolDbs(executor) {
  const tenantContexts = await listTenantSchoolContexts();

  for (const tenantContext of tenantContexts) {
    const document = await runWithSchoolContext(tenantContext.schoolId, () => executor(tenantContext));
    if (document) {
      return {
        ...tenantContext,
        doc: document,
      };
    }
  }

  return null;
}

async function deleteSchoolTenant(schoolId) {
  await connectDB();

  const normalizedSchoolId = normalizeSchoolId(schoolId);
  if (!normalizedSchoolId) {
    throw new Error('schoolId is required');
  }

  const tenantContexts = await listTenantSchoolContexts();
  const tenantContext = tenantContexts.find((context) => context.schoolId === normalizedSchoolId);
  if (!tenantContext) {
    const error = new Error('Colegio no encontrado');
    error.statusCode = 404;
    throw error;
  }

  if (shouldUseControlDbForSchool(normalizedSchoolId)) {
    ensureRegisteredModelsForConnection(ensureRootConnection());
    const modelNames = getRegisteredModelNames();
    const purgedCollections = [];

    for (const modelName of modelNames) {
      const model = resolveRegisteredModel(modelName);
      const result = await model.deleteMany({ schoolId: normalizedSchoolId });
      if (result.deletedCount > 0) {
        purgedCollections.push({ collectionName: model.collection.collectionName, deletedCount: result.deletedCount });
      }
    }

    return {
      mode: 'control_db_purge',
      schoolId: normalizedSchoolId,
      dbName: getControlDbName() || ensureRootConnection().name,
      purgedCollections,
    };
  }

  const dbName = resolveSchoolDbName(normalizedSchoolId);
  const connection = getSchoolConnection(normalizedSchoolId);
  await connection.db.dropDatabase();
  schoolConnectionCache.delete(dbName);

  return {
    mode: 'database_drop',
    schoolId: normalizedSchoolId,
    dbName,
  };
}

module.exports = {
  connectDB,
  createModelProxy,
  deleteSchoolTenant,
  extractSchoolIdFromRequest,
  findOneAcrossTenantSchoolDbs,
  getControlDbName,
  getCurrentSchoolId,
  getRegisteredModelNames,
  getSchoolConnection,
  listTenantSchoolContexts,
  mongoose,
  normalizeSchoolId,
  registerSchoolScopedModel,
  resolveRegisteredModel,
  resolveSchoolDbName,
  runInControlDb,
  runWithSchoolContext,
  slugifySchoolId,
};
