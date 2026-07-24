const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { runInControlDb } = require('../config/db');
const WwtecnoUser = require('../models/wwtecnoUser.model');
const WwtecnoCompany = require('../models/wwtecnoCompany.model');

const router = express.Router();

const WW_TECNO_DIAN_TEST = {
  environment: '2',
  softwareId: 'c00ba5da-17e0-43f0-a794-f4ebb4f13acc',
  softwarePin: '28502',
  softwareName: 'WW TECNO capital',
  softwareProviderName: 'WW TECNO S.A.S',
  softwareProviderNit: '902075865',
  supplierNit: '902075865',
  testSetId: 'df946319-efa0-4f45-b7b6-e3809b0d4966',
  authorizationNumber: '18760000001',
  prefix: 'SETP',
  startNumber: 990000000,
  endNumber: 995000000,
  nextNumber: 990000001,
  technicalKey: 'fc8eac422eba16e22ffd8c6f94b3f4',
  authorizationStartDate: new Date('2019-01-19T00:00:00.000Z'),
  authorizationEndDate: new Date('2030-01-19T00:00:00.000Z'),
  statusLabel: 'En proceso',
  requiredDocuments: { total: 50, invoices: 30, debitNotes: 10, creditNotes: 10 },
  acceptedDocuments: { total: 1, invoices: 1, debitNotes: 0, creditNotes: 0 },
};

const HOLDING_COMPANY = {
  companyId: 'ww_tecno_sas',
  legalName: 'WW TECNO S.A.S',
  tradeName: 'WW TECNO',
  nit: '902075865',
  isHolding: true,
  apps: ['capital', 'facturacion', 'bi'],
  dian: WW_TECNO_DIAN_TEST,
};

const DEFAULT_COMPANIES = [
  {
    companyId: 'comergio',
    legalName: 'Comergio',
    tradeName: 'Comergio',
    apps: ['comergio'],
  },
  {
    companyId: 'rentados',
    legalName: 'Rentados',
    tradeName: 'Rentados',
    apps: ['rentados'],
  },
  {
    companyId: 'magdalena_tours',
    legalName: 'Magdalena Tours',
    tradeName: 'Magdalena Tours',
    apps: ['magdalena_tours'],
  },
  {
    companyId: 'tiki_rest',
    legalName: 'Tiki Rest',
    tradeName: 'Tiki Rest',
    apps: ['facturacion'],
  },
  {
    companyId: 'amara_shawarma',
    legalName: 'Amara Shawarma',
    tradeName: 'Amara Shawarma',
    apps: ['facturacion'],
  },
  {
    companyId: 'boca_mar_cevicheria',
    legalName: 'Boca Mar Cevichería',
    tradeName: 'Boca Mar',
    apps: ['facturacion'],
  },
  {
    companyId: 'naranmiche_sazon',
    legalName: 'Naranmiche Sazón',
    tradeName: 'Naranmiche Sazón',
    apps: ['facturacion'],
  },
  {
    companyId: 'teach_me_school_cafeterias',
    legalName: 'Teach Me School Cafeterias',
    tradeName: 'Teach Me School Cafeterias',
    apps: ['facturacion', 'comergio'],
  },
  {
    companyId: 'tecno_wash',
    legalName: 'Tecno Wash',
    tradeName: 'Tecno Wash',
    apps: ['tecnowash'],
  },
  {
    companyId: 'pidelo',
    legalName: 'Pídelo',
    tradeName: 'Pídelo',
    apps: ['marketplace'],
  },
];

const REMOVED_COMPANY_IDS = ['global_imports', 'ww_tecno_sas'];
const DEFAULT_COMPANY_ID = 'comergio';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function serializeUser(user, companies = []) {
  if (!user) {
    return null;
  }

  return {
    id: String(user._id),
    email: user.email,
    name: user.name || '',
    role: user.role,
    companyIds: user.companyIds || [],
    defaultCompanyId: user.defaultCompanyId || '',
    companies: companies.map((company) => ({
      companyId: company.companyId,
      legalName: company.legalName,
      tradeName: company.tradeName || company.legalName,
      isHolding: Boolean(company.isHolding),
      apps: company.apps || [],
    })),
  };
}

function serializeCompany(company) {
  if (!company) {
    return null;
  }

  return {
    companyId: company.companyId,
    legalName: company.legalName,
    tradeName: company.tradeName || company.legalName,
    nit: company.nit || '',
    dv: company.dv || '',
    email: company.email || '',
    phone: company.phone || '',
    status: company.status,
    isHolding: Boolean(company.isHolding),
    taxResponsibilities: company.taxResponsibilities || [],
    address: company.address || {},
    branding: company.branding || {},
    apps: company.apps || [],
    dian: company.dian || null,
  };
}

function signWwtecnoToken(user) {
  return jwt.sign(
    {
      typ: 'wwtecno',
      userId: String(user._id),
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.WWTECNO_JWT_EXPIRES_IN || '7d' }
  );
}

async function ensureBootstrapData() {
  return runInControlDb(async () => {
    const activeCompanyIds = DEFAULT_COMPANIES.map((item) => item.companyId);
    const allCompanies = [HOLDING_COMPANY, ...DEFAULT_COMPANIES];

    for (const company of allCompanies) {
      const { dian, nit, ...base } = company;
      const isListed = activeCompanyIds.includes(company.companyId);
      await WwtecnoCompany.findOneAndUpdate(
        { wwEntity: 'company', companyId: company.companyId },
        {
          $setOnInsert: { wwEntity: 'company', companyId: company.companyId },
          $set: {
            legalName: base.legalName,
            tradeName: base.tradeName || base.legalName,
            isHolding: Boolean(base.isHolding),
            apps: base.apps || [],
            status: isListed ? 'active' : 'archived',
            ...(nit !== undefined ? { nit: nit || '' } : {}),
            ...(dian ? { dian } : {}),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    if (REMOVED_COMPANY_IDS.length) {
      await WwtecnoCompany.updateMany(
        { wwEntity: 'company', companyId: { $in: REMOVED_COMPANY_IDS } },
        { $set: { status: 'archived' } }
      );
    }

    const email = 'gerencia@wwtecno.com';
    const existing = await WwtecnoUser.findOne({ wwEntity: 'user', email });
    if (existing) {
      existing.companyIds = activeCompanyIds;
      if (!activeCompanyIds.includes(existing.defaultCompanyId)) {
        existing.defaultCompanyId = DEFAULT_COMPANY_ID;
      }
      await existing.save();
      return existing;
    }

    const passwordHash = await bcrypt.hash('B@rranquilla96', 10);
    return WwtecnoUser.create({
      wwEntity: 'user',
      email,
      name: 'Gerencia WW Tecno',
      passwordHash,
      role: 'owner',
      companyIds: activeCompanyIds,
      defaultCompanyId: DEFAULT_COMPANY_ID,
      status: 'active',
    });
  });
}

async function wwtecnoAuthMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [, token] = header.split(' ');
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.typ !== 'wwtecno') {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const user = await runInControlDb(() => (
      WwtecnoUser.findOne({ _id: decoded.userId, wwEntity: 'user', status: 'active' }).lean()
    ));
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.wwtecnoUser = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

router.post('/auth/bootstrap', async (_req, res) => {
  try {
    const user = await ensureBootstrapData();
    return res.status(200).json({
      message: 'WW Tecno Capital listo.',
      email: user.email,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    await ensureBootstrapData();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'Correo y contraseña son obligatorios.' });
    }

    const result = await runInControlDb(async () => {
      const user = await WwtecnoUser.findOne({ wwEntity: 'user', email, status: 'active' });
      if (!user) {
        return null;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return null;
      }

      user.lastLoginAt = new Date();
      await user.save();

      const companies = await WwtecnoCompany.find({
        wwEntity: 'company',
        companyId: { $in: user.companyIds || [] },
        status: 'active',
      })
        .sort({ isHolding: -1, legalName: 1 })
        .lean();

      return { user, companies };
    });

    if (!result) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const token = signWwtecnoToken(result.user);
    return res.status(200).json({
      token,
      user: serializeUser(result.user, result.companies),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/auth/me', wwtecnoAuthMiddleware, async (req, res) => {
  try {
    const companies = await runInControlDb(() => (
      WwtecnoCompany.find({
        wwEntity: 'company',
        companyId: { $in: req.wwtecnoUser.companyIds || [] },
        status: 'active',
      })
        .sort({ isHolding: -1, legalName: 1 })
        .lean()
    ));

    return res.status(200).json({
      user: serializeUser(req.wwtecnoUser, companies),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/companies', wwtecnoAuthMiddleware, async (req, res) => {
  try {
    const companies = await runInControlDb(() => (
      WwtecnoCompany.find({
        wwEntity: 'company',
        companyId: { $in: req.wwtecnoUser.companyIds || [] },
        status: 'active',
      })
        .sort({ isHolding: -1, legalName: 1 })
        .lean()
    ));

    return res.status(200).json({
      companies: companies.map(serializeCompany),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/dashboard/summary', wwtecnoAuthMiddleware, async (req, res) => {
  try {
    const companyId = normalizeText(req.query.companyId) || req.wwtecnoUser.defaultCompanyId || DEFAULT_COMPANY_ID;
    // Placeholder metrics until accounting/FE modules are wired per company.
    return res.status(200).json({
      companyId,
      cards: {
        monthlySales: 0,
        issuedInvoices: 0,
        revenue: 0,
        activeClients: 0,
        pendingDian: 0,
        rejectedDocuments: 0,
        treasuryBalance: 0,
        growthRate: 0,
      },
      charts: {
        sales: [],
        invoicing: [],
        revenue: [],
      },
      recentActivity: [],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/dian/config', wwtecnoAuthMiddleware, async (req, res) => {
  try {
    const companyId = normalizeText(req.query.companyId) || req.wwtecnoUser.defaultCompanyId || DEFAULT_COMPANY_ID;
    if (!(req.wwtecnoUser.companyIds || []).includes(companyId)) {
      return res.status(403).json({ message: 'Empresa no autorizada.' });
    }

    const company = await runInControlDb(() => (
      WwtecnoCompany.findOne({ wwEntity: 'company', companyId }).lean()
    ));

    return res.status(200).json({
      companyId,
      dian: company?.dian || WW_TECNO_DIAN_TEST,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = {
  router,
  ensureBootstrapData,
  wwtecnoAuthMiddleware,
};
