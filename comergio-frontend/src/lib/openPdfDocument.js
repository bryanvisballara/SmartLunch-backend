import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

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

export async function openJsPdfDocument(doc, fileName = 'documento.pdf') {
  if (!doc || typeof doc.output !== 'function') {
    throw new Error('No se pudo generar el PDF.');
  }

  const safeFileName = String(fileName || 'documento.pdf').trim() || 'documento.pdf';
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  try {
    if (Capacitor.isNativePlatform()) {
      try {
        await Browser.open({ url: blobUrl, presentationStyle: 'fullscreen' });
        return { url: blobUrl, mode: 'native-browser-blob' };
      } catch (browserError) {
        const dataUri = doc.output('datauristring');
        await Browser.open({ url: dataUri, presentationStyle: 'fullscreen' });
        return { url: dataUri, mode: 'native-browser-data-uri' };
      }
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
