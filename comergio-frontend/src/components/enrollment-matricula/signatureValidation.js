export function evaluateSignatureImage(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || !String(dataUrl).startsWith('data:image')) {
      resolve({
        valid: false,
        message: 'Dibuja tu firma antes de continuar.',
      });
      return;
    }

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });

      if (!context) {
        resolve({
          valid: false,
          message: 'No se pudo validar la firma.',
        });
        return;
      }

      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      let inkPixels = 0;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;

      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        if (alpha < 20) continue;

        const luminance = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
        if (luminance > 245) continue;

        inkPixels += 1;
        const pixel = index / 4;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }

      const strokeWidth = maxX - minX;
      const strokeHeight = maxY - minY;
      const valid = inkPixels >= 120 && strokeWidth >= 40 && strokeHeight >= 18;

      resolve({
        valid,
        message: valid
          ? ''
          : 'Tu firma debe ser clara y completa. Evita puntos o trazos muy pequeños.',
      });
    };

    image.onerror = () => {
      resolve({
        valid: false,
        message: 'No se pudo validar la firma.',
      });
    };

    image.src = dataUrl;
  });
}
