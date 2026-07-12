const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const EnrollmentMatriculaProcess = require('../models/enrollmentMatriculaProcess.model');
const {
  acceptConsent,
  acknowledgeIntro,
  buildSignedDocumentsZipForRectoria,
  getMatriculaRequirementForParent,
  getOrCreateProcessForCharge,
  listConsentsForRectoria,
  listPendingSignaturesForParent,
  listSignedDocumentsForRectoria,
  serializeProcess,
  signDocument,
  refreshContractParamsSnapshotIfNeeded,
} = require('../services/enrollmentMatricula.service');
const {
  approveMatriculaPurgeRequest,
  createMatriculaPurgeRequest,
  createIndividualConsentPurgeRequest,
  getMatriculaPurgeRequestSummary,
  listMatriculaPurgeRequestsForRequester,
  listMatriculaPurgeRequestsForReviewer,
  rejectMatriculaPurgeRequest,
  resolveReviewerName,
} = require('../services/enrollmentMatriculaPurgeRequest.service');

const RECTORIA_APPROVER_ROLES = ['rectoria', 'direccion', 'admin'];

function assertRectoriaApproverRole(role) {
  if (!RECTORIA_APPROVER_ROLES.includes(String(role || ''))) {
    return {
      ok: false,
      status: 403,
      message: 'Solo Rectoría puede autorizar esta solicitud.',
    };
  }

  return { ok: true };
}

function toObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) return null;
  return new mongoose.Types.ObjectId(String(value));
}

function normalizeText(value) {
  return String(value || '').trim();
}

const router = express.Router();

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

rectoriaRouter.get('/purge-requests/summary', async (req, res) => {
  try {
    const access = assertRectoriaApproverRole(req.user.role);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const summary = await getMatriculaPurgeRequestSummary({ schoolId: req.user.schoolId });
    return res.status(200).json(summary);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

rectoriaRouter.get('/purge-requests/pending', async (req, res) => {
  try {
    const access = assertRectoriaApproverRole(req.user.role);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const items = await listMatriculaPurgeRequestsForReviewer({
      schoolId: req.user.schoolId,
      status: 'pending',
    });
    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

rectoriaRouter.get('/purge-requests/mine', async (req, res) => {
  try {
    const items = await listMatriculaPurgeRequestsForRequester({
      schoolId: req.user.schoolId,
      userId: req.user.userId,
    });
    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

rectoriaRouter.post('/purge-requests', async (req, res) => {
  try {
    const actionType = normalizeText(req.body?.actionType);
    const processId = req.body?.processId;

    const request = actionType === 'clear_consent'
      ? await createIndividualConsentPurgeRequest({
        schoolId: req.user.schoolId,
        userId: req.user.userId,
        userRole: req.user.role,
        userName: req.user.name,
        processId,
      })
      : await createMatriculaPurgeRequest({
        schoolId: req.user.schoolId,
        userId: req.user.userId,
        userRole: req.user.role,
        userName: req.user.name,
        actionType,
      });

    return res.status(201).json({
      message: 'Solicitud enviada a Rectoría para autorización.',
      request,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
});

rectoriaRouter.post('/purge-requests/:requestId/approve', async (req, res) => {
  try {
    const access = assertRectoriaApproverRole(req.user.role);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const reviewerName = await resolveReviewerName({
      schoolId: req.user.schoolId,
      userId: req.user.userId,
    });
    const { request, result } = await approveMatriculaPurgeRequest({
      schoolId: req.user.schoolId,
      requestId: req.params.requestId,
      reviewerUserId: req.user.userId,
      reviewerName,
    });

    let message = 'Autorización aprobada.';
    if (request.actionType === 'delete_billing_payment') {
      message = 'Autorización aprobada. El pago fue anulado.';
    } else if (result?.updated) {
      message = `Autorización aprobada. Se eliminaron ${result.updated} registro(s).`;
    } else {
      message = 'Autorización aprobada. No había registros para eliminar.';
    }

    return res.status(200).json({
      message,
      request,
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
});

rectoriaRouter.post('/purge-requests/:requestId/reject', async (req, res) => {
  try {
    const access = assertRectoriaApproverRole(req.user.role);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const reviewerName = await resolveReviewerName({
      schoolId: req.user.schoolId,
      userId: req.user.userId,
    });
    const request = await rejectMatriculaPurgeRequest({
      schoolId: req.user.schoolId,
      requestId: req.params.requestId,
      reviewerUserId: req.user.userId,
      reviewerName,
      reviewNotes: req.body?.reviewNotes,
    });

    return res.status(200).json({
      message: 'Solicitud rechazada.',
      request,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
});

rectoriaRouter.get('/charge-adjustment-requests/pending', async (req, res) => {
  try {
    const access = assertRectoriaApproverRole(req.user.role);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const {
      listPendingChargeAdjustmentRequests,
    } = require('../services/academicChargeAdjustment.service');
    const items = await listPendingChargeAdjustmentRequests({ schoolId: req.user.schoolId });
    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

rectoriaRouter.post('/charge-adjustment-requests/:requestId/approve', async (req, res) => {
  try {
    const access = assertRectoriaApproverRole(req.user.role);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const {
      approveChargeAdjustmentRequest,
    } = require('../services/academicChargeAdjustment.service');
    const reviewerName = await resolveReviewerName({
      schoolId: req.user.schoolId,
      userId: req.user.userId,
    });
    const result = await approveChargeAdjustmentRequest({
      schoolId: req.user.schoolId,
      requestId: req.params.requestId,
      reviewerUserId: req.user.userId,
      reviewerName,
      reviewNotes: req.body?.reviewNotes,
    });

    return res.status(200).json({
      message: 'Ajuste de valor autorizado. El acudiente verá el nuevo monto al pagar.',
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
});

rectoriaRouter.post('/charge-adjustment-requests/:requestId/reject', async (req, res) => {
  try {
    const access = assertRectoriaApproverRole(req.user.role);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const {
      rejectChargeAdjustmentRequest,
    } = require('../services/academicChargeAdjustment.service');
    const reviewerName = await resolveReviewerName({
      schoolId: req.user.schoolId,
      userId: req.user.userId,
    });
    const request = await rejectChargeAdjustmentRequest({
      schoolId: req.user.schoolId,
      requestId: req.params.requestId,
      reviewerUserId: req.user.userId,
      reviewerName,
      reviewNotes: req.body?.reviewNotes,
    });

    return res.status(200).json({
      message: 'Solicitud de ajuste rechazada.',
      request,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
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
