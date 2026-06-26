function normalizeSchoolKey(value) {
  return String(value || '').trim().toLowerCase();
}

function isMillenniumSchoolId(schoolId) {
  const normalized = normalizeSchoolKey(schoolId);
  return normalized === 'millennium school' || normalized.includes('millennium');
}

function redactParentEnrollmentChargeAmount(charge = {}) {
  const category = String(charge.category || '').toLowerCase();
  if (category !== 'annual_tuition') {
    return charge;
  }

  if (String(charge.status || '').toLowerCase() === 'paid') {
    return charge;
  }

  return {
    ...charge,
    amount: null,
    originalAmount: null,
    chargeAmount: null,
    chargeOriginalAmount: null,
    outstandingAmount: null,
    fullAmount: null,
    amountHiddenUntilGateway: true,
  };
}

function redactParentEnrollmentPricingGuide(guide = {}) {
  if (!guide || typeof guide !== 'object') {
    return guide;
  }

  return {
    ...guide,
    enrollment: {
      ...(guide.enrollment || {}),
      fullAmount: 0,
      benefits: [],
      hiddenUntilGateway: true,
    },
  };
}

module.exports = {
  isMillenniumSchoolId,
  redactParentEnrollmentChargeAmount,
  redactParentEnrollmentPricingGuide,
};
