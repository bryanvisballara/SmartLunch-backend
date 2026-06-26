import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function openUrlInNewTab(url) {
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (popup) {
    return true;
  }

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

function triggerDownload(url, fileName) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function sanitizePdfFileName(fileName = 'documento.pdf') {
  const trimmed = String(fileName || 'documento.pdf').trim() || 'documento.pdf';
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
}

async function openPdfOnNative(doc, fileName) {
  const safeFileName = sanitizePdfFileName(fileName).replace(/[^\w.\-]+/g, '-');
  const base64 = doc.output('datauristring').split(',')[1];
  if (!base64) {
    throw new Error('No se pudo generar el contenido del PDF.');
  }

  await Filesystem.writeFile({
    path: safeFileName,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });

  const { uri } = await Filesystem.getUri({
    directory: Directory.Cache,
    path: safeFileName,
  });

  try {
    await Share.share({
      title: safeFileName,
      text: 'Documento de matrícula',
      url: uri,
      dialogTitle: 'Guardar o abrir PDF',
    });
    return { url: uri, mode: 'native-share' };
  } catch (shareError) {
    const shareMessage = String(shareError?.message || '').toLowerCase();
    if (shareMessage.includes('cancel') || shareMessage.includes('canceled') || shareMessage.includes('cancelled')) {
      return { url: uri, mode: 'native-share-cancelled' };
    }

    const webPath = Capacitor.convertFileSrc(uri);
    await Browser.open({ url: webPath, presentationStyle: 'fullscreen' });
    return { url: webPath, mode: 'native-browser-file' };
  }
}

export async function openJsPdfDocument(doc, fileName = 'documento.pdf') {
  if (!doc || typeof doc.output !== 'function') {
    throw new Error('No se pudo generar el PDF.');
  }

  const safeFileName = sanitizePdfFileName(fileName);
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  try {
    if (Capacitor.isNativePlatform()) {
      return openPdfOnNative(doc, safeFileName);
    }

    const opened = openUrlInNewTab(blobUrl);
    if (!opened) {
      triggerDownload(blobUrl, safeFileName);
    }

    return { url: blobUrl, mode: opened ? 'web-popup' : 'web-download' };
  } finally {
    window.setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 120000);
  }
}
