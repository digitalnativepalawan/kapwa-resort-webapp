/**
 * Client-side image compression using HTML5 Canvas.
 * Targets ≤800KB output. Falls back gracefully if canvas not available.
 */
export async function compressImage(file: File, maxKb = 800): Promise<File> {
  // Only compress images
  if (!file.type.startsWith('image/')) return file;
  // If already small enough, skip
  if (file.size <= maxKb * 1024) return file;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }

      // Scale down so long edge ≤ 1600px
      const maxDim = 1600;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height / width) * maxDim);
          width = maxDim;
        } else {
          width = Math.round((width / height) * maxDim);
          height = maxDim;
        }
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Binary search for quality that hits target size
      let lo = 0.3, hi = 0.92, quality = 0.82;
      const tryQuality = (q: number): Promise<Blob | null> =>
        new Promise(res => canvas.toBlob(res, 'image/jpeg', q));

      const iterate = async () => {
        for (let i = 0; i < 6; i++) {
          const blob = await tryQuality(quality);
          if (!blob) break;
          if (blob.size <= maxKb * 1024) { lo = quality; } else { hi = quality; }
          quality = (lo + hi) / 2;
        }
        const finalBlob = await tryQuality(lo);
        if (!finalBlob) { resolve(file); return; }
        const compressed = new File([finalBlob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
        resolve(compressed);
      };
      iterate();
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
