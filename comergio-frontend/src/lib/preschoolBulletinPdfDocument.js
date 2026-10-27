import { jsPDF } from 'jspdf';

function normalizeText(value) {
  return String(value || '').trim();
}

function entryMap(entries = []) {
  const map = new Map();
  entries.forEach((entry) => {
    if (!entry?.studentId || !entry?.indicatorId) return;
    map.set(`${entry.studentId}:${entry.indicatorId}`, entry);
  });
  return map;
}

function blockCommentMap(blockComments = []) {
  const map = new Map();
  blockComments.forEach((item) => {
    if (!item?.studentId || !item?.blockId) return;
    map.set(`${item.studentId}:${item.blockId}`, normalizeText(item.comment));
  });
  return map;
}

function performanceTone(label = '') {
  const compact = label.toLowerCase();
  if (compact.includes('(ia)') || compact.includes('alcanzado')) return { fill: [21, 128, 61], text: [255, 255, 255] };
  if (compact.includes('(ep)') || compact.includes('en proceso')) return { fill: [249, 115, 22], text: [255, 255, 255] };
  if (compact.includes('(ip)') || compact.includes('iniciando')) return { fill: [239, 68, 68], text: [255, 255, 255] };
  return { fill: [226, 232, 240], text: [51, 65, 85] };
}

function ensureSpace(doc, y, needed, margin) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed <= pageHeight - 18) return y;
  doc.addPage();
  return margin + 6;
}

function drawBulletinFooter(doc, margin) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Documento académico · Comergio Academy', margin, pageHeight - 7);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  }
}

function drawBulletinHeader(doc, {
  margin,
  pageWidth,
  schoolName,
  documentTitle,
  bulletin,
  schoolLogoDataUrl = '',
  schoolLogoLayout = 'square',
  schoolLogoFormat = 'PNG',
  hideSchoolNameInHeader = false,
}) {
  const headerHeight = schoolLogoLayout === 'wide' ? 36 : 34;
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');
  doc.setFillColor(15, 118, 110);
  doc.rect(0, headerHeight, pageWidth, 2.8, 'F');

  const logoX = margin;
  const logoY = 6;
  const isWideLogo = schoolLogoLayout === 'wide';
  const logoBox = isWideLogo ? 58 : 22;
  const logoBoxHeight = isWideLogo ? 20 : 22;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(logoX, logoY, logoBox, logoBoxHeight, 2, 2, 'FD');

  if (schoolLogoDataUrl) {
    try {
      const imageFormat = String(schoolLogoFormat || 'PNG').toUpperCase();
      const imagePaddingX = isWideLogo ? 2 : 1.5;
      const imagePaddingY = isWideLogo ? 2 : 1.5;
      doc.addImage(
        schoolLogoDataUrl,
        imageFormat,
        logoX + imagePaddingX,
        logoY + imagePaddingY,
        logoBox - imagePaddingX * 2,
        logoBoxHeight - imagePaddingY * 2,
      );
    } catch {
      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('LOGO', logoX + 7, logoY + 13);
    }
  }

  const textX = logoX + logoBox + 6;
  let titleY = 13;
  doc.setTextColor(15, 23, 42);
  if (!hideSchoolNameInHeader) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(normalizeText(schoolName) || 'Colegio', textX, titleY);
    titleY += 6;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 118, 110);
  doc.text(normalizeText(documentTitle), textX, hideSchoolNameInHeader ? 14 : 19);
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${normalizeText(bulletin.academicPeriodLabel || bulletin.academicPeriodKey)} · ${normalizeText(bulletin.gradeLabel || bulletin.gradeKey)}`,
    textX,
    hideSchoolNameInHeader ? 20 : 25,
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.setFillColor(15, 118, 110);
  const badge = 'PREESCOLAR';
  const badgeWidth = doc.getTextWidth(badge) + 8;
  doc.roundedRect(pageWidth - margin - badgeWidth, 8, badgeWidth, 7, 2, 2, 'F');
  doc.text(badge, pageWidth - margin - badgeWidth + 4, 12.5);

  return headerHeight + 6;
}

function drawSignatureColumn(doc, {
  x,
  y,
  width,
  title,
  signatureDataUrl = '',
  signerName = '',
}) {
  const blockHeight = 34;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, width, blockHeight, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(title, x + width / 2, y + 5, { align: 'center' });

  const imageY = y + 8;
  const imageH = 17;
  const signature = normalizeText(signatureDataUrl);
  if (signature && /^data:image\/png;base64,/i.test(signature)) {
    try {
      doc.addImage(signature, 'PNG', x + 6, imageY, width - 12, imageH);
    } catch {
      doc.setDrawColor(148, 163, 184);
      doc.line(x + 8, imageY + imageH - 1, x + width - 8, imageY + imageH - 1);
    }
  } else {
    doc.setDrawColor(148, 163, 184);
    doc.line(x + 8, imageY + imageH - 1, x + width - 8, imageY + imageH - 1);
  }

  if (signerName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(normalizeText(signerName), x + width / 2, y + blockHeight - 3, { align: 'center' });
  }

  return blockHeight;
}

function drawBulletinSignatures(doc, {
  margin,
  lineWidth,
  y,
  headroomSignatureDataUrl = '',
  headroomSignerName = '',
  coordinatorSignatureDataUrl = '',
  coordinatorSignerName = '',
}) {
  y = ensureSpace(doc, y, 42, margin);
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, margin + lineWidth, y);
  y += 6;

  const gap = 8;
  const colWidth = (lineWidth - gap) / 2;
  const blockHeight = drawSignatureColumn(doc, {
    x: margin,
    y,
    width: colWidth,
    title: 'Firma del director de grupo',
    signatureDataUrl: headroomSignatureDataUrl,
    signerName: headroomSignerName,
  });
  drawSignatureColumn(doc, {
    x: margin + colWidth + gap,
    y,
    width: colWidth,
    title: 'Firma de la coordinadora',
    signatureDataUrl: coordinatorSignatureDataUrl,
    signerName: coordinatorSignerName,
  });

  return y + blockHeight + 4;
}

export function createPreschoolBulletinStudentPdfDocument({
  bulletin,
  student,
  schoolName = 'Colegio',
  schoolLogoDataUrl = '',
  schoolLogoLayout = 'square',
  schoolLogoFormat = 'PNG',
  hideSchoolNameInHeader = false,
  headroomSignatureDataUrl = '',
  headroomSignerName = '',
  coordinatorSignatureDataUrl = '',
  coordinatorSignerName = '',
  documentTitle = 'Boletín general',
}) {
  if (!bulletin || !student?.id) {
    throw new Error('Selecciona un estudiante para generar el PDF.');
  }

  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const margin = 16;
  const pageWidth = doc.internal.pageSize.getWidth();
  const lineWidth = pageWidth - margin * 2;
  let y = drawBulletinHeader(doc, {
    margin,
    pageWidth,
    schoolName,
    documentTitle,
    bulletin,
    schoolLogoDataUrl,
    schoolLogoLayout,
    schoolLogoFormat,
    hideSchoolNameInHeader,
  });
  doc.setTextColor(15, 23, 42);
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, lineWidth, 22, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Estudiante: ${normalizeText(student.name)}`, margin + 4, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  if (student.schoolCode) {
    doc.text(`Código: ${normalizeText(student.schoolCode)}`, margin + 4, y + 14);
  }
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin + 4, y + 19);
  y += 28;

  const marks = entryMap(bulletin.entries || []);
  const dimensionComments = blockCommentMap(bulletin.blockComments || []);
  const blocks = Array.isArray(bulletin.blocks) ? bulletin.blocks : [];

  blocks.forEach((block) => {
    y = ensureSpace(doc, y, 18, margin);
    doc.setDrawColor(15, 118, 110);
    doc.setLineWidth(0.6);
    doc.line(margin, y, margin + lineWidth, y);
    y += 5;
    doc.setTextColor(15, 118, 110);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const blockTitle = `${block.kind === 'topic' ? 'Tópico' : 'Dimensión'}: ${normalizeText(block.name)}`;
    doc.text(blockTitle, margin, y);
    y += 5;
    if (block.teacherName) {
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(`Docente: ${normalizeText(block.teacherName)}`, margin, y);
      y += 5;
    }

    (block.indicators || []).forEach((indicator) => {
      const entry = marks.get(`${student.id}:${indicator.id}`);
      const performance = normalizeText(entry?.performanceLabel) || 'Sin calificar';
      const observation = normalizeText(entry?.observation);
      const indicatorTitle = normalizeText(indicator.text);
      const subjectTag = normalizeText(indicator.subjectLabel);
      y = ensureSpace(doc, y, 14, margin);

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, lineWidth, observation ? 16 : 11, 1.5, 1.5, 'FD');

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      const titleLines = doc.splitTextToSize(indicatorTitle, lineWidth - 52);
      doc.text(titleLines, margin + 3, y + 4.5);

      const tone = performanceTone(performance);
      doc.setFillColor(...tone.fill);
      doc.setTextColor(...tone.text);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      const perfLabel = performance.length > 28 ? `${performance.slice(0, 26)}…` : performance;
      const perfWidth = Math.min(48, doc.getTextWidth(perfLabel) + 6);
      doc.roundedRect(margin + lineWidth - perfWidth - 3, y + 1.5, perfWidth, 5.5, 1.5, 1.5, 'F');
      doc.text(perfLabel, margin + lineWidth - perfWidth, y + 5.2);

      y += observation ? 16 : 11;
      if (subjectTag) {
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(subjectTag, margin + 3, y - (observation ? 9 : 4));
      }
      if (observation) {
        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        const obsLines = doc.splitTextToSize(observation, lineWidth - 8);
        doc.text(obsLines, margin + 3, y - 4);
      }
      y += 2;
    });

    const dimensionComment = dimensionComments.get(`${student.id}:${block.id}`);
    if (dimensionComment) {
      y = ensureSpace(doc, y, 16, margin);
      doc.setFillColor(240, 253, 250);
      doc.setDrawColor(153, 246, 228);
      doc.roundedRect(margin, y, lineWidth, 14, 1.5, 1.5, 'FD');
      doc.setTextColor(15, 118, 110);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('Comentario general de la dimensión', margin + 3, y + 4.5);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const commentLines = doc.splitTextToSize(dimensionComment, lineWidth - 8);
      doc.text(commentLines.slice(0, 2), margin + 3, y + 9);
      y += 14 + 3;
    } else {
      y += 2;
    }
  });

  drawBulletinSignatures(doc, {
    margin,
    lineWidth,
    y,
    headroomSignatureDataUrl,
    headroomSignerName,
    coordinatorSignatureDataUrl,
    coordinatorSignerName,
  });

  drawBulletinFooter(doc, margin);

  return doc;
}

export function buildSamplePreschoolGeneralBulletin() {
  const studentId = 'sample-student-1';
  const blockCognitive = 'block-cognitive';
  const blockMotor = 'block-motor';
  const indicators = [
    { id: 'ind-1', text: 'Identifica suave y áspero', subjectLabel: 'P.B.L' },
    { id: 'ind-2', text: 'Reconoce frío y caliente', subjectLabel: 'P.B.L' },
    { id: 'ind-3', text: 'Diferencia dulce y salado', subjectLabel: 'P.B.L' },
    { id: 'ind-4', text: 'Salta con pie juntos', subjectLabel: 'SPORTS' },
    { id: 'ind-5', text: 'Sigue ritmo musical básico', subjectLabel: 'MUSIC' },
  ];
  const entries = [
    { studentId, indicatorId: 'ind-1', performanceLabel: 'Indicador alcanzado (IA)' },
    { studentId, indicatorId: 'ind-2', performanceLabel: 'En proceso (EP)' },
    { studentId, indicatorId: 'ind-3', performanceLabel: 'Indicador alcanzado (IA)', observation: 'Reconoce sabores en merienda con apoyo mínimo.' },
    { studentId, indicatorId: 'ind-4', performanceLabel: 'En proceso (EP)' },
    { studentId, indicatorId: 'ind-5', performanceLabel: 'Iniciando proceso (IP)' },
  ];
  return {
    bulletin: {
      gradeKey: 'kinder-2',
      gradeLabel: 'Kinder 2',
      academicPeriodKey: 'periodo-1',
      academicPeriodLabel: 'Periodo 1',
      blocks: [
        {
          id: blockCognitive,
          kind: 'dimension',
          name: 'Dimensión cognitiva',
          teacherName: 'Andrea Barrios',
          indicators: indicators.slice(0, 3),
        },
        {
          id: blockMotor,
          kind: 'dimension',
          name: 'Dimensión motriz',
          teacherName: 'Camila Ríos',
          indicators: indicators.slice(3),
        },
      ],
      entries,
      blockComments: [
        {
          studentId,
          blockId: blockCognitive,
          comment: 'Bianca participa con entusiasmo en exploraciones sensoriales y pide turno para compartir sus descubrimientos.',
        },
      ],
    },
    student: {
      id: studentId,
      name: 'Bianca Alvarez Barros',
      schoolCode: 'K2-0042',
    },
    schoolName: 'Millennium School',
    headroomSignerName: 'Andrea Barrios',
    coordinatorSignerName: 'Coordinación académica',
    documentTitle: 'Boletín general',
  };
}
