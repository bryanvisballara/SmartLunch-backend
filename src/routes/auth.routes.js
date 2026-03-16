const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/user.model');
const Student = require('../models/student.model');
const Wallet = require('../models/wallet.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const EmailVerification = require('../models/emailVerification.model');
const PasswordResetCode = require('../models/passwordResetCode.model');
const { sendRegistrationVerificationEmail, sendPasswordResetCodeEmail } = require('../services/brevo.service');
const { signAccessToken } = require('../utils/token');

const router = express.Router();
const rpName = process.env.WEBAUTHN_RP_NAME || 'Comergio';
const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
const expectedOrigins = (process.env.WEBAUTHN_ORIGIN
  ? process.env.WEBAUTHN_ORIGIN.split(',')
  : ['http://localhost:5173'])
  .map((origin) => origin.trim())
  .filter(Boolean);

function normalizeUsername(username) {
  return String(username || '').toLowerCase().trim();
}

function normalizeSchoolId(schoolId) {
  return String(schoolId || '').trim();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashVerificationCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isValidEmail(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || ''));
}

function safePasswordResetSuccessMessage() {
  return 'Si el correo existe, enviamos un codigo de recuperacion.';
}

function normalizeStudentPayload(rawStudent) {
  const firstName = String(rawStudent?.firstName || '').trim();
  const lastName = String(rawStudent?.lastName || '').trim();
  const grade = String(rawStudent?.grade || '').trim();
  const fullName = `${firstName} ${lastName}`.trim();

  return {
    firstName,
    lastName,
    grade,
    fullName,
  };
}

router.post('/password/forgot/send-code', async (req, res) => {
  try {
    const { schoolId, email } = req.body;

    if (!schoolId || !email) {
      return res.status(400).json({ message: 'schoolId and email are required' });
    }

    const normalizedSchoolId = normalizeSchoolId(schoolId);
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedSchoolId || !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Debes ingresar un correo valido.' });
    }

    const user = await User.findOne({
      schoolId: normalizedSchoolId,
      status: 'active',
      deletedAt: null,
      $or: [{ username: normalizedEmail }, { email: normalizedEmail }],
    });

    if (!user) {
      return res.status(200).json({ success: true, message: safePasswordResetSuccessMessage() });
    }

    const targetEmail = normalizeEmail(user.email || user.username);
    if (!isValidEmail(targetEmail)) {
      return res.status(200).json({ success: true, message: safePasswordResetSuccessMessage() });
    }

    await PasswordResetCode.updateMany(
      { schoolId: normalizedSchoolId, userId: user._id, status: 'pending' },
      { $set: { status: 'consumed' } }
    );

    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await PasswordResetCode.create({
      schoolId: normalizedSchoolId,
      userId: user._id,
      email: targetEmail,
      codeHash: hashVerificationCode(code),
      expiresAt,
      attempts: 0,
      status: 'pending',
    });

    await sendPasswordResetCodeEmail({
      toEmail: targetEmail,
      toName: user.name || user.username,
      code,
    });

    return res.status(200).json({ success: true, message: safePasswordResetSuccessMessage() });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/password/forgot/verify-code', async (req, res) => {
  try {
    const { schoolId, email, code } = req.body;

    if (!schoolId || !email || !code) {
      return res.status(400).json({ message: 'schoolId, email and code are required' });
    }

    const normalizedSchoolId = normalizeSchoolId(schoolId);
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = String(code || '').trim();

    if (!/^\d{6}$/.test(normalizedCode)) {
      return res.status(400).json({ message: 'El codigo debe tener 6 digitos.' });
    }

    const resetDoc = await PasswordResetCode.findOne({
      schoolId: normalizedSchoolId,
      email: normalizedEmail,
      status: 'pending',
    }).sort({ createdAt: -1 });

    if (!resetDoc) {
      return res.status(400).json({ message: 'No se encontro una recuperacion pendiente para este correo.' });
    }

    if (resetDoc.expiresAt.getTime() < Date.now()) {
      resetDoc.status = 'failed';
      await resetDoc.save();
      return res.status(400).json({ message: 'El codigo vencio. Solicita uno nuevo.' });
    }

    if (Number(resetDoc.attempts || 0) >= 5) {
      resetDoc.status = 'failed';
      await resetDoc.save();
      return res.status(400).json({ message: 'Superaste el numero de intentos. Solicita un nuevo codigo.' });
    }

    if (resetDoc.codeHash !== hashVerificationCode(normalizedCode)) {
      resetDoc.attempts = Number(resetDoc.attempts || 0) + 1;
      if (resetDoc.attempts >= 5) {
        resetDoc.status = 'failed';
      }
      await resetDoc.save();
      return res.status(400).json({ message: 'El codigo no coincide. Intenta nuevamente.' });
    }

    const resetToken = crypto.randomBytes(24).toString('hex');
    resetDoc.status = 'verified';
    resetDoc.verifiedAt = new Date();
    resetDoc.resetTokenHash = hashResetToken(resetToken);
    await resetDoc.save();

    return res.status(200).json({ success: true, resetToken });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/password/forgot/reset', async (req, res) => {
  try {
    const { schoolId, email, resetToken, newPassword } = req.body;

    if (!schoolId || !email || !resetToken || !newPassword) {
      return res.status(400).json({ message: 'schoolId, email, resetToken and newPassword are required' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: 'La contrasena debe tener al menos 6 caracteres.' });
    }

    const normalizedSchoolId = normalizeSchoolId(schoolId);
    const normalizedEmail = normalizeEmail(email);

    const resetDoc = await PasswordResetCode.findOne({
      schoolId: normalizedSchoolId,
      email: normalizedEmail,
      status: 'verified',
    }).sort({ createdAt: -1 });

    if (!resetDoc) {
      return res.status(400).json({ message: 'No se encontro una verificacion valida para este correo.' });
    }

    if (resetDoc.expiresAt.getTime() < Date.now()) {
      resetDoc.status = 'failed';
      await resetDoc.save();
      return res.status(400).json({ message: 'La sesion de recuperacion vencio. Solicita un nuevo codigo.' });
    }

    if (resetDoc.resetTokenHash !== hashResetToken(resetToken)) {
      return res.status(400).json({ message: 'Token de recuperacion invalido.' });
    }

    const user = await User.findOne({
      _id: resetDoc.userId,
      schoolId: normalizedSchoolId,
      status: 'active',
      deletedAt: null,
    });

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    resetDoc.status = 'consumed';
    resetDoc.consumedAt = new Date();
    await resetDoc.save();

    return res.status(200).json({ success: true, message: 'Contrasena actualizada correctamente.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/register/email/send-code', async (req, res) => {
  try {
    const {
      schoolId,
      firstName,
      lastName,
      phone,
      email,
    } = req.body;

    if (!schoolId || !firstName || !lastName || !phone || !email) {
      return res.status(400).json({ message: 'schoolId, firstName, lastName, phone and email are required' });
    }

    const normalizedSchoolId = normalizeSchoolId(schoolId);
    const normalizedEmail = normalizeEmail(email);
    const normalizedFirstName = String(firstName || '').trim();
    const normalizedLastName = String(lastName || '').trim();
    const normalizedPhone = String(phone || '').trim();

    if (!normalizedSchoolId || !normalizedFirstName || !normalizedLastName || !normalizedPhone || !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide valid registration data' });
    }

    const existingUser = await User.findOne({ username: normalizedEmail, deletedAt: null });
    if (existingUser) {
      return res.status(409).json({ message: 'Este correo ya se encuentra registrado.' });
    }

    await EmailVerification.updateMany(
      { schoolId: normalizedSchoolId, email: normalizedEmail, status: 'pending' },
      { $set: { status: 'consumed' } }
    );

    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await EmailVerification.create({
      schoolId: normalizedSchoolId,
      email: normalizedEmail,
      codeHash: hashVerificationCode(verificationCode),
      expiresAt,
      attempts: 0,
      status: 'pending',
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      phone: normalizedPhone,
    });

    await sendRegistrationVerificationEmail({
      toEmail: normalizedEmail,
      toName: `${normalizedFirstName} ${normalizedLastName}`.trim(),
      code: verificationCode,
    });

    return res.status(200).json({
      success: true,
      message: 'Codigo de verificacion enviado al correo electronico.',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/register/email/verify-code', async (req, res) => {
  try {
    const { schoolId, email, code } = req.body;

    if (!schoolId || !email || !code) {
      return res.status(400).json({ message: 'schoolId, email and code are required' });
    }

    const normalizedSchoolId = normalizeSchoolId(schoolId);
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = String(code || '').trim();

    if (!/^\d{6}$/.test(normalizedCode)) {
      return res.status(400).json({ message: 'El codigo debe tener 6 digitos.' });
    }

    const verification = await EmailVerification.findOne({
      schoolId: normalizedSchoolId,
      email: normalizedEmail,
      status: 'pending',
    }).sort({ createdAt: -1 });

    if (!verification) {
      return res.status(400).json({ message: 'No se encontro una verificacion pendiente para este correo.' });
    }

    if (verification.expiresAt.getTime() < Date.now()) {
      verification.status = 'failed';
      await verification.save();
      return res.status(400).json({ message: 'El codigo vencio. Solicita uno nuevo.' });
    }

    if (Number(verification.attempts || 0) >= 5) {
      verification.status = 'failed';
      await verification.save();
      return res.status(400).json({ message: 'Superaste el numero de intentos. Solicita un nuevo codigo.' });
    }

    const matches = verification.codeHash === hashVerificationCode(normalizedCode);
    if (!matches) {
      verification.attempts = Number(verification.attempts || 0) + 1;
      if (verification.attempts >= 5) {
        verification.status = 'failed';
      }
      await verification.save();
      return res.status(400).json({ message: 'El codigo no coincide. Intenta nuevamente.' });
    }

    verification.status = 'verified';
    verification.verifiedAt = new Date();
    await verification.save();

    return res.status(200).json({
      success: true,
      message: 'Correo verificado correctamente.',
      registrationProfile: {
        schoolId: verification.schoolId,
        firstName: verification.firstName,
        lastName: verification.lastName,
        phone: verification.phone,
        email: verification.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/register/complete', async (req, res) => {
  const session = await User.startSession();

  try {
    const { schoolId, email, password, students } = req.body;

    if (!schoolId || !email || !password) {
      return res.status(400).json({ message: 'schoolId, email and password are required' });
    }

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: 'Debes registrar al menos un alumno.' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: 'La contrasena debe tener al menos 6 caracteres.' });
    }

    const normalizedSchoolId = normalizeSchoolId(schoolId);
    const normalizedEmail = normalizeEmail(email);
    const normalizedStudents = students.map(normalizeStudentPayload);

    if (!normalizedSchoolId || !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Datos de registro invalidos.' });
    }

    if (normalizedStudents.some((student) => !student.firstName || !student.lastName || !student.grade || !student.fullName)) {
      return res.status(400).json({ message: 'Cada alumno debe tener nombre, apellido y grado.' });
    }

    const verification = await EmailVerification.findOne({
      schoolId: normalizedSchoolId,
      email: normalizedEmail,
      status: 'verified',
    }).sort({ createdAt: -1 });

    if (!verification) {
      return res.status(400).json({ message: 'Primero debes verificar tu correo electronico.' });
    }

    if (verification.expiresAt.getTime() < Date.now()) {
      verification.status = 'failed';
      await verification.save();
      return res.status(400).json({ message: 'La verificacion expiro. Solicita un nuevo codigo.' });
    }

    const existingUser = await User.findOne({ username: normalizedEmail, deletedAt: null });
    if (existingUser) {
      return res.status(409).json({ message: 'Este correo ya se encuentra registrado.' });
    }

    const parentName = `${String(verification.firstName || '').trim()} ${String(verification.lastName || '').trim()}`.trim();
    const passwordHash = await bcrypt.hash(String(password), 10);

    session.startTransaction();

    const [parentUser] = await User.create(
      [
        {
          schoolId: normalizedSchoolId,
          name: parentName || normalizedEmail,
          username: normalizedEmail,
          passwordHash,
          role: 'parent',
          status: 'active',
          email: normalizedEmail,
          phone: String(verification.phone || '').trim(),
        },
      ],
      { session }
    );

    const createdStudents = [];
    for (const studentPayload of normalizedStudents) {
      const [student] = await Student.create(
        [
          {
            schoolId: normalizedSchoolId,
            name: studentPayload.fullName,
            grade: studentPayload.grade,
            status: 'active',
          },
        ],
        { session }
      );

      await Wallet.create(
        [
          {
            schoolId: normalizedSchoolId,
            studentId: student._id,
            balance: 0,
          },
        ],
        { session }
      );

      await ParentStudentLink.findOneAndUpdate(
        {
          schoolId: normalizedSchoolId,
          parentId: parentUser._id,
          studentId: student._id,
        },
        {
          schoolId: normalizedSchoolId,
          parentId: parentUser._id,
          studentId: student._id,
          relationship: 'parent',
          status: 'active',
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          session,
        }
      );

      createdStudents.push({
        _id: student._id,
        name: student.name,
        grade: student.grade || '',
      });
    }

    verification.status = 'consumed';
    await verification.save({ session });

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: 'Registro completado con exito.',
      parent: {
        _id: parentUser._id,
        name: parentUser.name,
        email: parentUser.email || parentUser.username,
      },
      students: createdStudents,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Este correo ya se encuentra registrado.' });
    }

    return res.status(500).json({ message: error.message });
  } finally {
    await session.endSession();
  }
});

function toAuthResponse(user) {
  const token = signAccessToken(user);
  const assignedStoreSource = user?.assignedStoreId && typeof user.assignedStoreId === 'object' && user.assignedStoreId.name
    ? user.assignedStoreId
    : null;
  const assignedStore = assignedStoreSource
    ? {
      _id: assignedStoreSource._id,
      name: assignedStoreSource.name,
      status: assignedStoreSource.status,
    }
    : null;

  return {
    token,
    user: {
      id: user._id,
      schoolId: user.schoolId,
      name: user.name,
      username: user.username,
      role: user.role,
      biometricEnabled: Boolean(user.webauthn?.credentials?.length),
      assignedStore,
    },
  };
}

function ensureParent(user, res) {
  if (!user || user.role !== 'parent') {
    res.status(403).json({ message: 'Biometric auth is only available for parent accounts.' });
    return false;
  }

  return true;
}

router.post('/register', async (req, res) => {
  try {
    const { schoolId, name, username, password, email = '', phone = '' } = req.body;

    if (!schoolId || !name || !username || !password) {
      return res.status(400).json({ message: 'schoolId, name, username and password are required' });
    }

    const normalizedSchoolId = normalizeSchoolId(schoolId);
    const normalizedUsername = normalizeUsername(username);
    const normalizedName = String(name || '').trim();

    if (!normalizedSchoolId || !normalizedUsername || !normalizedName) {
      return res.status(400).json({ message: 'schoolId, name, username and password are required' });
    }

    const existingUser = await User.findOne({ username: normalizedUsername, deletedAt: null });
    if (existingUser) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      schoolId: normalizedSchoolId,
      name: normalizedName,
      username: normalizedUsername,
      passwordHash,
      role: 'parent',
      status: 'active',
      email: String(email || '').trim().toLowerCase(),
      phone: String(phone || '').trim(),
    });

    return res.status(201).json(toAuthResponse(user));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, email, password, schoolId } = req.body;

    const rawIdentifier = String(username || email || '').trim();
    const normalizedIdentifier = normalizeUsername(rawIdentifier);
    const normalizedSchoolId = normalizeSchoolId(schoolId);

    if (!normalizedIdentifier || !password) {
      return res.status(400).json({ message: 'email or username and password are required' });
    }

    const identifierFilter = {
      status: 'active',
      deletedAt: null,
      $or: [{ username: normalizedIdentifier }, { email: normalizedIdentifier }],
    };

    let user = null;

    if (normalizedSchoolId) {
      user = await User.findOne({
        ...identifierFilter,
        schoolId: normalizedSchoolId,
      })
        .populate('assignedStoreId', 'name status');
    } else {
      const matches = await User.find(identifierFilter)
        .populate('assignedStoreId', 'name status')
        .limit(2);

      if (matches.length > 1) {
        return res.status(400).json({ message: 'schoolId is required when identifier exists in multiple schools' });
      }

      user = matches[0] || null;
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    return res.status(200).json(toAuthResponse(user));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/biometric/register/options', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.user.userId, status: 'active', deletedAt: null });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!ensureParent(user, res)) {
      return null;
    }

    const existingCredentials = Array.isArray(user.webauthn?.credentials) ? user.webauthn.credentials : [];

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: String(user._id),
      userName: user.username,
      userDisplayName: user.name || user.username,
      timeout: 60000,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
      excludeCredentials: existingCredentials.map((credential) => ({
        id: Buffer.from(credential.credentialID, 'base64url'),
        type: 'public-key',
        transports: Array.isArray(credential.transports) ? credential.transports : undefined,
      })),
    });

    user.webauthn = user.webauthn || {};
    user.webauthn.registrationChallenge = options.challenge;
    await user.save();

    return res.status(200).json(options);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/biometric/register/verify', authMiddleware, async (req, res) => {
  try {
    const { registrationResponse } = req.body;

    if (!registrationResponse) {
      return res.status(400).json({ message: 'registrationResponse is required' });
    }

    const user = await User.findOne({ _id: req.user.userId, status: 'active', deletedAt: null });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!ensureParent(user, res)) {
      return null;
    }

    const expectedChallenge = user.webauthn?.registrationChallenge;
    if (!expectedChallenge) {
      return res.status(400).json({ message: 'Registration challenge not found. Please retry setup.' });
    }

    const verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ message: 'Could not verify biometric credential.' });
    }

    const { credentialID, credentialPublicKey, counter, credentialBackedUp, credentialDeviceType } = verification.registrationInfo;
    const encodedCredentialID = Buffer.from(credentialID).toString('base64url');
    const encodedPublicKey = Buffer.from(credentialPublicKey).toString('base64url');
    const transports = Array.isArray(registrationResponse.response?.transports)
      ? registrationResponse.response.transports
      : [];

    user.webauthn = user.webauthn || {};
    user.webauthn.credentials = Array.isArray(user.webauthn.credentials) ? user.webauthn.credentials : [];

    const existingIndex = user.webauthn.credentials.findIndex(
      (credential) => credential.credentialID === encodedCredentialID
    );

    const nextCredential = {
      credentialID: encodedCredentialID,
      publicKey: encodedPublicKey,
      counter: Number(counter || 0),
      transports,
      deviceType: credentialDeviceType || 'singleDevice',
      backedUp: Boolean(credentialBackedUp),
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };

    if (existingIndex >= 0) {
      user.webauthn.credentials[existingIndex] = {
        ...user.webauthn.credentials[existingIndex],
        ...nextCredential,
      };
    } else {
      user.webauthn.credentials.push(nextCredential);
    }

    user.webauthn.registrationChallenge = null;
    await user.save();

    return res.status(200).json({ success: true, biometricEnabled: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/biometric/login/options', async (req, res) => {
  try {
    const { username, schoolId } = req.body;

    if (!username || !schoolId) {
      return res.status(400).json({ message: 'username and schoolId are required' });
    }

    const normalizedUsername = normalizeUsername(username);
    const normalizedSchoolId = normalizeSchoolId(schoolId);
    const user = await User.findOne({
      username: normalizedUsername,
      schoolId: normalizedSchoolId,
      status: 'active',
      deletedAt: null,
    });
    if (!user || user.role !== 'parent') {
      return res.status(404).json({ message: 'No biometric credentials found for this account.' });
    }

    const credentials = Array.isArray(user.webauthn?.credentials) ? user.webauthn.credentials : [];
    if (!credentials.length) {
      return res.status(404).json({ message: 'No biometric credentials found for this account.' });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 60000,
      userVerification: 'preferred',
      allowCredentials: credentials.map((credential) => ({
        id: Buffer.from(credential.credentialID, 'base64url'),
        type: 'public-key',
        transports: Array.isArray(credential.transports) ? credential.transports : undefined,
      })),
    });

    user.webauthn = user.webauthn || {};
    user.webauthn.authenticationChallenge = options.challenge;
    await user.save();

    return res.status(200).json(options);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/biometric/login/verify', async (req, res) => {
  try {
    const { username, schoolId, authenticationResponse } = req.body;

    if (!username || !schoolId || !authenticationResponse) {
      return res.status(400).json({ message: 'username, schoolId and authenticationResponse are required' });
    }

    const normalizedUsername = normalizeUsername(username);
    const normalizedSchoolId = normalizeSchoolId(schoolId);
    const user = await User.findOne({
      username: normalizedUsername,
      schoolId: normalizedSchoolId,
      status: 'active',
      deletedAt: null,
    });
    if (!user || user.role !== 'parent') {
      return res.status(401).json({ message: 'Biometric login failed.' });
    }

    const expectedChallenge = user.webauthn?.authenticationChallenge;
    if (!expectedChallenge) {
      return res.status(400).json({ message: 'Authentication challenge not found. Please retry login.' });
    }

    const credentials = Array.isArray(user.webauthn?.credentials) ? user.webauthn.credentials : [];
    const authenticator = credentials.find((credential) => credential.credentialID === authenticationResponse.id);
    if (!authenticator) {
      return res.status(404).json({ message: 'Biometric credential is not registered for this account.' });
    }

    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: authenticator.credentialID,
        publicKey: Buffer.from(authenticator.publicKey, 'base64url'),
        counter: Number(authenticator.counter || 0),
        transports: Array.isArray(authenticator.transports) ? authenticator.transports : [],
      },
    });

    if (!verification.verified) {
      return res.status(401).json({ message: 'Biometric login failed.' });
    }

    const nextCounter = verification.authenticationInfo?.newCounter;
    user.webauthn.authenticationChallenge = null;
    authenticator.counter = Number(nextCounter || authenticator.counter || 0);
    authenticator.lastUsedAt = new Date();
    await user.save();

    return res.status(200).json(toAuthResponse(user));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-passwordHash -webauthn')
      .populate('assignedStoreId', 'name status');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({
      ...user.toObject(),
      assignedStore: user.assignedStoreId
        ? {
          _id: user.assignedStoreId._id,
          name: user.assignedStoreId.name,
          status: user.assignedStoreId.status,
        }
        : null,
      assignedStoreId: user.assignedStoreId?._id || null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
