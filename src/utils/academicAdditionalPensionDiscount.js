function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeAdditionalDiscountPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

function normalizeAdditionalPensionDiscount(profile = {}) {
  const type = normalizeText(profile?.monthlyTuitionAdditionalDiscountType) === 'fixed' ? 'fixed' : 'percent';
  return {
    type,
    percent: normalizeAdditionalDiscountPercent(profile?.monthlyTuitionAdditionalDiscountPercent),
    fixedAmount: Math.max(0, Number(profile?.monthlyTuitionAdditionalDiscountFixedAmount || 0)),
    label: normalizeText(profile?.monthlyTuitionAdditionalDiscountLabel),
  };
}

function applyMonthlyTuitionAdditionalDiscount(amountAfterBenefits, profile = {}) {
  const safeAmount = Math.max(0, Math.round(Number(amountAfterBenefits || 0)));
  if (safeAmount <= 0) return 0;

  const additional = normalizeAdditionalPensionDiscount(profile);
  if (additional.type === 'fixed' && additional.fixedAmount > 0) {
    return Math.max(0, safeAmount - Math.min(safeAmount, additional.fixedAmount));
  }
  if (additional.percent > 0) {
    return Math.max(0, Math.round(safeAmount * (1 - (additional.percent / 100))));
  }
  return safeAmount;
}

function hasMonthlyTuitionAdditionalDiscount(profile = {}) {
  const additional = normalizeAdditionalPensionDiscount(profile);
  return (additional.type === 'fixed' && additional.fixedAmount > 0)
    || (additional.type === 'percent' && additional.percent > 0);
}

module.exports = {
  normalizeAdditionalDiscountPercent,
  normalizeAdditionalPensionDiscount,
  applyMonthlyTuitionAdditionalDiscount,
  hasMonthlyTuitionAdditionalDiscount,
};
