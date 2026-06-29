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

function isUserCancelledShare(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('cancel') || message.includes('canceled') || message.includes('cancelled') || message.includes('abort');
}

function isFilesystemUnavailableError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('not implemented') || message.includes('unimplemented');
}

async function sharePdfWithWebApi(blob, fileName) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }

  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
    return false;
  }

  await navigator.share({
    files: [file],
    title: fileName,
    text: 'Documento de matrícula',
  });
  return true;
}

async function sharePdfWithCapacitorShare(uri, fileName) {
  await Share.share({
    title: fileName,
    text: 'Documento de matrícula',
    url: uri,
    dialogTitle: 'Guardar o abrir PDF',
  });
}

async function openPdfInBrowser(blob) {
  const blobUrl = URL.createObjectURL(blob);
  try {
    await Browser.open({ url: blobUrl, presentationStyle: 'fullscreen' });
    return { url: blobUrl, mode: 'native-browser-blob' };
  } catch (browserError) {
    const dataUri = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo preparar el PDF para visualizarlo.'));
      reader.readAsDataURL(blob);
    });

    if (dataUri.startsWith('data:application/pdf')) {
      await Browser.open({ url: dataUri, presentationStyle: 'fullscreen' });
      return { url: dataUri, mode: 'native-browser-data-uri' };
    }

    throw browserError;
  }
}

async function openPdfWithFilesystem(doc, fileName, blob) {
  const safeFileName = fileName.replace(/[^\w.\-]+/g, '-');
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
    await sharePdfWithCapacitorShare(uri, safeFileName);
    return { url: uri, mode: 'native-share' };
  } catch (shareError) {
    if (isUserCancelledShare(shareError)) {
      return { url: uri, mode: 'native-share-cancelled' };
    }

    const webPath = Capacitor.convertFileSrc(uri);
    await Browser.open({ url: webPath, presentationStyle: 'fullscreen' });
    return { url: webPath, mode: 'native-browser-file' };
  }
}

async function openPdfOnNative(doc, fileName) {
  const safeFileName = sanitizePdfFileName(fileName);
  const blob = doc.output('blob');

  try {
    const sharedWithWebApi = await sharePdfWithWebApi(blob, safeFileName);
    if (sharedWithWebApi) {
      return { mode: 'web-share-file' };
    }
  } catch (shareError) {
    if (isUserCancelledShare(shareError)) {
      return { mode: 'web-share-cancelled' };
    }
  }

  try {
    return await openPdfWithFilesystem(doc, safeFileName, blob);
  } catch (filesystemError) {
    if (!isFilesystemUnavailableError(filesystemError)) {
      throw filesystemError;
    }
  }

  return openPdfInBrowser(blob);
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
