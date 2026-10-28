export function resolveCoexistenceBulletinObservationText(score, templates = []) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return '';
  }

  const list = (Array.isArray(templates) ? templates : [])
    .filter((item) => item?.active !== false && String(item?.text || '').trim())
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));

  const match = list.find((item) => (
    numericScore >= Number(item.minScore)
    && numericScore <= Number(item.maxScore)
  ));

  return String(match?.text || '').trim();
}

export function resolveCoexistenceBulletinObservationLabel(score, templates = []) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return '';
  }

  const list = (Array.isArray(templates) ? templates : [])
    .filter((item) => item?.active !== false)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));

  const match = list.find((item) => (
    numericScore >= Number(item.minScore)
    && numericScore <= Number(item.maxScore)
  ));

  return String(match?.label || '').trim();
}
