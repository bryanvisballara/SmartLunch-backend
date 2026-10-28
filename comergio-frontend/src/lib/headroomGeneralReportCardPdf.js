import { jsPDF } from 'jspdf';
import { openJsPdfDocument } from './openPdfDocument';
import { areSchoolIdsCompatible, getSchoolDisplayName } from './schools';
import { getSchoolBulletinLogoOptions, resolveSchoolBulletinLogoDataUrl } from './schoolBulletinBranding';

const MILLENNIUM_SCHOOL_ID = 'Millennium School';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeName(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function resolveSchoolBrand(schoolId, schoolName) {
  if (areSchoolIdsCompatible(schoolId, MILLENNIUM_SCHOOL_ID)) {
    return {
      header: [18, 18, 18],
      headerDeep: [8, 8, 8],
      gold: [196, 154, 62],
      accent: [18, 18, 18],
    };
  }
  return {
    header: [18, 18, 18],
    headerDeep: [8, 8, 8],
    gold: [196, 154, 62],
    accent: [18, 18, 18],
  };
}

function formatScore(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(raw)) return null;
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ];
}

function textColorForFill(rgb) {
  const [red, green, blue] = rgb.map((channel) => channel / 255);
  const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  return luminance > 0.62 ? [24, 24, 24] : [255, 255, 255];
}

function resolvePerformanceLevel(score, gradingScale) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return null;
  const levels = Array.isArray(gradingScale?.performanceLevels) ? gradingScale.performanceLevels : [];
  return levels.find((level) => numericScore >= Number(level.minScore) && numericScore <= Number(level.maxScore)) || null;
}

function scoreTone(value, gradingScale) {
  const level = resolvePerformanceLevel(value, gradingScale);
  const fill = hexToRgb(level?.color);
  if (!fill) return { fill: [236, 236, 236], text: [24, 24, 24], label: '' };
  return { fill, text: textColorForFill(fill), label: normalizeText(level.label) };
}

function sortedPerformanceLevels(gradingScale) {
  return [...(gradingScale?.performanceLevels || [])].sort(
    (left, right) => Number(left.minScore) - Number(right.minScore) || Number(left.order || 0) - Number(right.order || 0)
  );
}

function drawGradingScaleTable(doc, {
  startY,
  margin,
  contentWidth,
  gradingScale,
  brand,
}) {
  const levels = sortedPerformanceLevels(gradingScale);
  if (!levels.length) return startY;

  const cardPadding = 4;
  const titleBlock = 12;
  const headerHeight = 7;
  const rowHeight = 6.8;
  const tableTop = startY;
  const innerX = margin + cardPadding;
  const innerW = contentWidth - (cardPadding * 2);
  const gridTop = tableTop + titleBlock;
  const gridHeight = headerHeight + (levels.length * rowHeight);
  const cardHeight = titleBlock + gridHeight + cardPadding;
  const rangeColW = innerW * 0.4;
  const categoryColW = innerW - rangeColW;
  const rangeCenterX = innerX + (rangeColW / 2);
  const categoryCenterX = innerX + rangeColW + (categoryColW / 2);
  const splitX = innerX + rangeColW;

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, tableTop, contentWidth, cardHeight, 2.4, 2.4, 'F');
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, tableTop, contentWidth, cardHeight, 2.4, 2.4, 'S');

  const levelTitle = gradingScale.levelLabel
    ? `Escala de valoración · ${gradingScale.levelLabel}`
    : 'Escala de valoración';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...brand.header);
  doc.text(levelTitle, margin + (contentWidth / 2), tableTop + 5.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Escala ${gradingScale.minScore}–${gradingScale.maxScore} · Calificación aprobatoria ${gradingScale.passingScore}`,
    margin + (contentWidth / 2),
    tableTop + 10,
    { align: 'center' }
  );

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.25);
  doc.roundedRect(innerX, gridTop, innerW, gridHeight, 1.8, 1.8, 'S');

  doc.setFillColor(248, 248, 248);
  doc.rect(innerX, gridTop, innerW, headerHeight, 'F');
  doc.line(splitX, gridTop, splitX, gridTop + gridHeight);

  const headerBaseline = gridTop + 4.8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(55, 55, 55);
  doc.text('Valoración numérica', rangeCenterX, headerBaseline, { align: 'center' });
  doc.text('Categoría de desempeño', categoryCenterX, headerBaseline, { align: 'center' });
  doc.line(innerX, gridTop + headerHeight, innerX + innerW, gridTop + headerHeight);

  levels.forEach((level, index) => {
    const rowTop = gridTop + headerHeight + (index * rowHeight);
    const rowBaseline = rowTop + 4.6;

    if (index % 2 === 1) {
      doc.setFillColor(252, 252, 252);
      doc.rect(innerX, rowTop, innerW, rowHeight, 'F');
      doc.line(splitX, rowTop, splitX, rowTop + rowHeight);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    doc.text(`${level.minScore} – ${level.maxScore}`, rangeCenterX, rowBaseline, { align: 'center' });

    const tone = scoreTone(level.maxScore, gradingScale);
    const label = level.label;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const labelWidth = doc.getTextWidth(label);
    const pillPadX = 3;
    const pillW = Math.min(categoryColW - 4, labelWidth + (pillPadX * 2));
    const pillH = 5;
    const pillX = categoryCenterX - (pillW / 2);
    const pillY = rowTop + 1;

    doc.setFillColor(...tone.fill);
    doc.roundedRect(pillX, pillY, pillW, pillH, 1.4, 1.4, 'F');
    doc.setTextColor(...tone.text);
    doc.text(label, categoryCenterX, pillY + 3.6, { align: 'center', baseline: 'alphabetic' });

    if (index < levels.length - 1) {
      doc.setDrawColor(235, 235, 235);
      doc.line(innerX, rowTop + rowHeight, innerX + innerW, rowTop + rowHeight);
    }
  });

  return tableTop + cardHeight + 3;
}

function drawSubjectScoreBadge(doc, {
  xRight,
  yTop,
  score,
  gradingScale,
}) {
  const tone = scoreTone(score, gradingScale);
  const scoreLabel = formatScore(score);
  const badgeWidth = 22;
  const scoreBoxHeight = 8;
  const categoryHeight = tone.label ? 4.2 : 0;
  const badgeHeight = scoreBoxHeight + categoryHeight;
  const centerX = xRight - (badgeWidth / 2);

  doc.setFillColor(...tone.fill);
  doc.roundedRect(xRight - badgeWidth, yTop, badgeWidth, scoreBoxHeight, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...tone.text);
  doc.text(scoreLabel, centerX, yTop + 5.4, { align: 'center', baseline: 'alphabetic' });

  if (tone.label) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...tone.fill);
    doc.text(tone.label, centerX, yTop + scoreBoxHeight + 3.2, { align: 'center', baseline: 'alphabetic' });
  }

  return badgeHeight;
}

function drawBulletinSignatureFooter(doc, {
  margin,
  contentWidth,
  y,
  ensureSpace,
  signatures = {},
}) {
  const blockHeight = 34;
  ensureSpace(blockHeight + 6);
  y += 4;
  const gap = 8;
  const colWidth = (contentWidth - gap) / 2;
  const columns = [
    {
      title: 'Director de grupo',
      dataUrl: signatures.headroomSignatureDataUrl,
      name: signatures.headroomSignerName || signatures.headroomTeacherName || '',
    },
    {
      title: 'Coordinación',
      dataUrl: signatures.coordinatorSignatureDataUrl,
      name: signatures.coordinatorSignerName || '',
    },
  ];

  columns.forEach((column, index) => {
    const x = margin + (index * (colWidth + gap));
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, colWidth, blockHeight, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    doc.text(column.title, x + (colWidth / 2), y + 5, { align: 'center' });

    const imageBoxY = y + 7;
    const imageBoxH = 18;
    if (column.dataUrl) {
      try {
        doc.addImage(column.dataUrl, 'PNG', x + 6, imageBoxY, colWidth - 12, imageBoxH);
      } catch (_error) {
        doc.line(x + 8, imageBoxY + imageBoxH - 1, x + colWidth - 8, imageBoxY + imageBoxH - 1);
      }
    } else {
      doc.setDrawColor(180, 180, 180);
      doc.line(x + 8, imageBoxY + imageBoxH - 1, x + colWidth - 8, imageBoxY + imageBoxH - 1);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 30, 30);
    const name = column.name || '—';
    doc.text(name, x + (colWidth / 2), y + blockHeight - 3, { align: 'center', maxWidth: colWidth - 8 });
  });

  return y + blockHeight + 4;
}

function renderBulletinPdf({
  schoolId = '',
  schoolName,
  student,
  bulletin,
  sectionLabel,
  gradingScale,
  crestDataUrl = '',
  crestFormat = 'PNG',
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const brand = resolveSchoolBrand(schoolId, schoolName);
  const crest = crestDataUrl;
  const courseLabel = normalizeText(sectionLabel);
  const gradeLabel = normalizeText(student.grade);
  const showCourse = courseLabel && normalizeName(courseLabel) !== normalizeName(gradeLabel);

  const paintPageChrome = () => {
    doc.setFillColor(245, 245, 244);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFillColor(...brand.headerDeep);
    doc.rect(0, 0, pageWidth, 8, 'F');
    doc.setFillColor(...brand.gold);
    doc.rect(0, 8, pageWidth, 1.4, 'F');
  };

  const drawHeader = () => {
    doc.setFillColor(...brand.header);
    doc.roundedRect(margin, 13, contentWidth, 30, 3, 3, 'F');
    if (crest) {
      doc.setFillColor(255, 255, 255);
      doc.circle(margin + 15.5, 28, 11, 'F');
      doc.addImage(crest, crestFormat || 'PNG', margin + 6.4, 18.9, 18.2, 18.2);
    }
    const textX = crest ? margin + 31 : margin + 8;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(schoolName || 'Colegio', textX, 23.5);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Boletín de calificaciones', textX, 29.5);
    doc.setFontSize(8.5);
    doc.setTextColor(214, 214, 214);
    doc.text(bulletin.periodName || 'Periodo', textX, 35.5);
  };

  paintPageChrome();
  drawHeader();

  let y = 47;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, y, contentWidth, 16, 3, 3, 'F');
  doc.setTextColor(18, 18, 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(student.name || 'Alumno', margin + 6, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 82);
  const meta = [
    student.schoolCode ? `Código ${student.schoolCode}` : '',
    gradeLabel ? `Grado ${gradeLabel}` : '',
    showCourse ? `Curso ${courseLabel}` : '',
  ].filter(Boolean).join('   ·   ');
  doc.text(meta || 'Estudiante', margin + 6, y + 12.5);
  y += 20;

  const subjectLines = Array.isArray(bulletin.subjectLines) ? bulletin.subjectLines : [];
  if (!subjectLines.length) {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(90, 100, 110);
    doc.text('No hay boletines de materia enviados para este alumno en el periodo consultado.', margin, y + 8);
    return doc;
  }

  y = drawGradingScaleTable(doc, {
    startY: y,
    margin,
    contentWidth,
    gradingScale,
    brand,
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...brand.header);
  doc.text('Materias del periodo', margin, y + 2);
  y += 6;

  const ensureSpace = (needed) => {
    if (y + needed <= pageHeight - 10) return;
    doc.addPage();
    paintPageChrome();
    doc.setFillColor(...brand.header);
    doc.rect(0, 0, pageWidth, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`${schoolName}  ·  ${student.name}  ·  ${bulletin.periodName}`, margin, 8);
    y = 18;
  };

  subjectLines.forEach((line) => {
    const observation = line.teacherObservation || 'Sin observación del docente.';
    const observationLines = doc.splitTextToSize(observation, contentWidth - 48);
    const subjectTone = scoreTone(line.periodAverage, gradingScale);
    const scoreStackHeight = 8 + (subjectTone.label ? 4.2 : 0);
    const cardHeight = Math.max(20, 12.5 + observationLines.length * 3.6, scoreStackHeight + 6);
    ensureSpace(cardHeight + 3);

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, contentWidth, cardHeight, 2.4, 2.4, 'F');
    doc.setFillColor(...subjectTone.fill);
    doc.rect(margin, y + 2, 1.6, cardHeight - 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(18, 18, 18);
    doc.text(line.subject || 'Materia', margin + 6, y + 5.6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    doc.text(line.teacherName ? `Docente: ${line.teacherName}` : 'Docente', margin + 6, y + 9.6);

    drawSubjectScoreBadge(doc, {
      xRight: margin + contentWidth - 4,
      yTop: y + 3,
      score: line.periodAverage,
      gradingScale,
    });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(45, 45, 45);
    doc.text(observationLines, margin + 6, y + 14.2);
    y += cardHeight + 1.8;
  });

  const headroomText = bulletin.headroomObservation || 'El director de grupo aún no registra una observación general.';
  const headroomLines = doc.splitTextToSize(headroomText, contentWidth - 58);
  const summaryHeight = Math.max(24, 14 + headroomLines.length * 4);
  ensureSpace(summaryHeight + 2);

  y += 2;
  const averageTone = scoreTone(bulletin.overallAverage, gradingScale);
  const averageCenterX = margin + 23;
  const pointToMm = (points) => points * 0.3528;
  const averageGap = 1.4;
  const averageBlockHeight = pointToMm(8) + averageGap + pointToMm(18) + averageGap + pointToMm(7.5);
  const averageBlockTop = y + ((summaryHeight - averageBlockHeight) / 2);
  const averageLabelBaseline = averageBlockTop + (pointToMm(8) * 0.78);
  const averageScoreBaseline = averageLabelBaseline + averageGap + (pointToMm(18) * 0.78);
  const averageLevelBaseline = averageScoreBaseline + averageGap + (pointToMm(7.5) * 0.72);
  doc.setFillColor(...averageTone.fill);
  doc.roundedRect(margin, y, 46, summaryHeight, 2.6, 2.6, 'F');
  doc.setTextColor(...averageTone.text);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('PROMEDIO', averageCenterX, averageLabelBaseline, { align: 'center', baseline: 'alphabetic' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(formatScore(bulletin.overallAverage), averageCenterX, averageScoreBaseline, { align: 'center', baseline: 'alphabetic' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(averageTone.label || 'del periodo', averageCenterX, averageLevelBaseline, { align: 'center', baseline: 'alphabetic' });

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 50, y, contentWidth - 50, summaryHeight, 2.6, 2.6, 'F');
  doc.setDrawColor(24, 24, 24);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin + 50, y, contentWidth - 50, summaryHeight, 2.6, 2.6, 'S');
  doc.setTextColor(...brand.headerDeep);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Observación del director de grupo', margin + 56, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);
  doc.text(headroomLines, margin + 56, y + 13);
  if (bulletin.headroomTeacherName) {
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(bulletin.headroomTeacherName, margin + 56, y + summaryHeight - 4);
  }
  y += summaryHeight + 6;

  const coexistenceScore = bulletin.coexistenceScore;
  const coexistenceTone = scoreTone(coexistenceScore, gradingScale);
  const coexistenceLabel = bulletin.coexistencePerformanceLabel || coexistenceTone.label || '';
  const coexistenceComment = bulletin.coexistenceObservation
    || 'El director de grupo aún no registra una observación de convivencia para este periodo.';
  const coexistenceCommentLines = doc.splitTextToSize(coexistenceComment, contentWidth - 58);
  const coexistenceMeta = Number(bulletin.coexistenceTotalDeducted) > 0
    ? `Descuento acumulado: −${formatScore(bulletin.coexistenceTotalDeducted)}% (${bulletin.coexistenceObservationCount || 0} observación${Number(bulletin.coexistenceObservationCount) === 1 ? '' : 'es'})`
    : '';
  const coexistenceBlockHeight = Math.max(22, 16 + coexistenceCommentLines.length * 4 + (coexistenceMeta ? 4 : 0));
  ensureSpace(12 + coexistenceBlockHeight + 4);

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.35);
  doc.line(margin, y, margin + contentWidth, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...brand.header);
  doc.text('Convivencia escolar', margin, y + 2);
  y += 8;

  doc.setFillColor(...coexistenceTone.fill);
  doc.roundedRect(margin, y, 46, coexistenceBlockHeight, 2.6, 2.6, 'F');
  const coexistenceCenterX = margin + 23;
  doc.setTextColor(...coexistenceTone.text);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('CONVIVENCIA', coexistenceCenterX, y + 7, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(
    coexistenceScore === null || coexistenceScore === undefined ? '—' : `${formatScore(coexistenceScore)}%`,
    coexistenceCenterX,
    y + 14,
    { align: 'center' }
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(coexistenceLabel || 'del periodo', coexistenceCenterX, y + 19, { align: 'center' });

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 50, y, contentWidth - 50, coexistenceBlockHeight, 2.6, 2.6, 'F');
  doc.setDrawColor(24, 24, 24);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin + 50, y, contentWidth - 50, coexistenceBlockHeight, 2.6, 2.6, 'S');
  doc.setTextColor(...brand.headerDeep);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Observación de convivencia', margin + 56, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);
  doc.text(coexistenceCommentLines, margin + 56, y + 13);
  if (coexistenceMeta) {
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text(coexistenceMeta, margin + 56, y + coexistenceBlockHeight - 4);
  }
  y += coexistenceBlockHeight + 4;

  y = drawBulletinSignatureFooter(doc, {
    margin,
    contentWidth,
    y,
    ensureSpace,
    signatures: {
      headroomSignatureDataUrl: bulletin.headroomSignatureDataUrl,
      headroomSignerName: bulletin.headroomSignerName,
      headroomTeacherName: bulletin.headroomTeacherName,
      coordinatorSignatureDataUrl: bulletin.coordinatorSignatureDataUrl,
      coordinatorSignerName: bulletin.coordinatorSignerName,
    },
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Generado en Comergio  ·  ${new Date().toLocaleDateString('es-CO')}`,
    pageWidth / 2,
    pageHeight - 6,
    { align: 'center' }
  );

  return doc;
}

function createHeadroomGeneralReportCardPdfDocument({
  schoolId = '',
  schoolName = '',
  student = {},
  bulletin = {},
  sectionLabel = '',
  gradeLabel = '',
  gradingScale = {},
  schoolLogoDataUrl = '',
  schoolLogoFormat = 'PNG',
}) {
  return renderBulletinPdf({
    schoolId,
    schoolName,
    student: {
      name: student.name || student.studentName || 'Alumno',
      schoolCode: student.schoolCode || '',
      grade: gradeLabel || student.grade || '',
    },
    bulletin,
    sectionLabel,
    gradingScale: gradingScale || {},
    crestDataUrl: schoolLogoDataUrl,
    crestFormat: schoolLogoFormat,
  });
}

export async function openHeadroomGeneralReportCardPdf(options = {}) {
  const schoolId = options.schoolId || '';
  const schoolName = options.schoolName || getSchoolDisplayName({ schoolId, schoolName: options.schoolName }, 'Colegio');
  const logoOptions = getSchoolBulletinLogoOptions(schoolId);
  const schoolLogoDataUrl = options.schoolLogoDataUrl || await resolveSchoolBulletinLogoDataUrl(schoolId);
  const doc = createHeadroomGeneralReportCardPdfDocument({
    ...options,
    schoolId,
    schoolName,
    schoolLogoDataUrl,
    schoolLogoFormat: options.schoolLogoFormat || logoOptions.imageFormat || 'PNG',
  });
  const slug = normalizeText(options.student?.name || options.student?.studentName).replace(/\s+/g, '-').toLowerCase() || 'estudiante';
  await openJsPdfDocument(doc, `boletin-general-${slug}.pdf`);
}

export { createHeadroomGeneralReportCardPdfDocument };
