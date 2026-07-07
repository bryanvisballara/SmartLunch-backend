const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const EnrollmentMatriculaProcess = require('../models/enrollmentMatriculaProcess.model');
const {
  acceptConsent,
  acknowledgeIntro,
  buildSignedDocumentsZipForRectoria,
  clearAllConsentsForRectoria,
  clearAllSignedDocumentsForRectoria,
  getMatriculaRequirementForParent,
  getOrCreateProcessForCharge,
  listConsentsForRectoria,
  listPendingSignaturesForParent,
  listSignedDocumentsForRectoria,
  serializeProcess,
  signDocument,
  refreshContractParamsSnapshotIfNeeded,
} = require('../services/enrollmentMatricula.service');

const router = express.Router();

function toObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) return null;
  return new mongoose.Types.ObjectId(String(value));
}

function normalizeText(value) {
  return String(value || '').trim();
}

router.use(authMiddleware);

router.get('/portal/enrollment-matricula/requirement', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const parentUserId = role === 'admin' ? req.query?.parentUserId || userId : userId;
    const requirement = await getMatriculaRequirementForParent({
      schoolId,
      parentId: parentUserId,
    });
    return res.status(200).json(requirement);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/enrollment-matricula/process', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const parentUserId = role === 'admin' ? req.query?.parentUserId || userId : userId;
    const chargeId = req.query?.chargeId;

    const { process, charge } = await getOrCreateProcessForCharge({
      schoolId,
      parentId: parentUserId,
      chargeId,
      req,
    });

    return res.status(200).json({ process: serializeProcess(process, charge) });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
});

router.get('/portal/enrollment-matricula/pending-signatures', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const parentUserId = role === 'admin' ? req.query?.parentUserId || userId : userId;
    const items = await listPendingSignaturesForParent({ schoolId, parentId: parentUserId });
    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/enrollment-matricula/process/:processId/ack-intro', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const parentUserId = role === 'admin' ? req.body?.parentUserId || userId : userId;
    const process = await acknowledgeIntro({
      processId: req.params.processId,
      schoolId,
      parentId: parentUserId,
    });
    return res.status(200).json({ process: serializeProcess(process) });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.post('/portal/enrollment-matricula/process/:processId/consent', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const parentUserId = role === 'admin' ? req.body?.parentUserId || userId : userId;
    if (!req.body?.accepted) {
      return res.status(400).json({ message: 'Debes aceptar el consentimiento previo de matricula.' });
    }
    const process = await acceptConsent({
      processId: req.params.processId,
      schoolId,
      parentId: parentUserId,
      req,
    });
    return res.status(200).json({ process: serializeProcess(process) });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.post('/portal/enrollment-matricula/process/:processId/payment/confirm', async (req, res) => {
  return res.status(410).json({
    message: 'El pago de matricula debe realizarse mediante la pasarela Wompi.',
    gateway: 'wompi',
  });
});

router.get('/portal/enrollment-matricula/process/:processId/payment-status', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const parentUserId = role === 'admin' ? req.query?.parentUserId || userId : userId;
    const process = await EnrollmentMatriculaProcess.findOne({
      _id: req.params.processId,
      schoolId,
      parentId: parentUserId,
    });

    if (!process) {
      return res.status(404).json({ message: 'Proceso de matricula no encontrado.' });
    }

    await refreshContractParamsSnapshotIfNeeded(process);

    return res.status(200).json({ process: serializeProcess(process) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/enrollment-matricula/process/:processId/sign-contract', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const parentUserId = role === 'admin' ? req.body?.parentUserId || userId : userId;
    const process = await signDocument({
      processId: req.params.processId,
      schoolId,
      parentId: parentUserId,
      documentType: 'contract',
      signatureImage: req.body?.signatureImage,
      signedPdfBase64: req.body?.signedPdfBase64,
      fileName: req.body?.fileName,
      req,
    });
    return res.status(200).json({ process: serializeProcess(process) });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.post('/portal/enrollment-matricula/process/:processId/sign-pagare', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const parentUserId = role === 'admin' ? req.body?.parentUserId || userId : userId;
    const process = await signDocument({
      processId: req.params.processId,
      schoolId,
      parentId: parentUserId,
      documentType: 'pagare',
      signatureImage: req.body?.signatureImage,
      signedPdfBase64: req.body?.signedPdfBase64,
      fileName: req.body?.fileName,
      req,
    });
    return res.status(200).json({ process: serializeProcess(process) });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

const rectoriaRouter = express.Router();
rectoriaRouter.use(authMiddleware);
rectoriaRouter.use(roleMiddleware(['rectoria', 'direccion', 'admin', 'academic_secretary', 'admissions', 'billing']));

rectoriaRouter.get('/consents', async (req, res) => {
  try {
    const items = await listConsentsForRectoria({ schoolId: req.user.schoolId });
    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

rectoriaRouter.get('/signatures', async (req, res) => {
  try {
    const items = await listSignedDocumentsForRectoria({ schoolId: req.user.schoolId });
    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

rectoriaRouter.delete('/consents', async (req, res) => {
  try {
    const result = await clearAllConsentsForRectoria({ schoolId: req.user.schoolId });
    return res.status(200).json({
      message: result.updated
        ? `Se eliminaron ${result.updated} consentimiento(s) registrado(s).`
        : 'No había consentimientos para eliminar.',
      ...result,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

rectoriaRouter.delete('/signatures', async (req, res) => {
  try {
    const result = await clearAllSignedDocumentsForRectoria({ schoolId: req.user.schoolId });
    return res.status(200).json({
      message: result.updated
        ? `Se eliminaron ${result.updated} registro(s) de documentos firmados.`
        : 'No había documentos firmados para eliminar.',
      ...result,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

rectoriaRouter.get('/signatures/download-zip', async (req, res) => {
  try {
    const { buffer, fileCount } = await buildSignedDocumentsZipForRectoria({ schoolId: req.user.schoolId });
    if (!fileCount) {
      return res.status(404).json({ message: 'No hay documentos firmados con PDF disponible para exportar.' });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="documentos-firmados-matricula-${stamp}.zip"`);
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

rectoriaRouter.get('/documents/:processId/:documentType/download', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const process = await EnrollmentMatriculaProcess.findOne({
      _id: req.params.processId,
      schoolId,
    }).lean();

    if (!process) {
      return res.status(404).json({ message: 'Documento no encontrado.' });
    }

    const documentType = normalizeText(req.params.documentType);
    const document = documentType === 'pagare' ? process.pagare : process.contract;
    const pdfBase64 = normalizeText(document?.signedPdfBase64);

    if (!pdfBase64) {
      return res.status(404).json({ message: 'El documento firmado no esta disponible.' });
    }

    const buffer = Buffer.from(pdfBase64, 'base64');
    const fileName = normalizeText(document?.fileName) || `${documentType}-${process.studentName || 'matricula'}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = {
  parentEnrollmentMatriculaRouter: router,
  rectoriaEnrollmentMatriculaRouter: rectoriaRouter,
};
