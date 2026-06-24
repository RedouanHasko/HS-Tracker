/**
 * Client-side image compression before Firebase Storage upload.
 * Resizes large photos and re-encodes as JPEG to reduce storage/bandwidth on the free tier.
 */

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  fileName: string;
}

const DEFAULT_MAX = 1600;
const DEFAULT_QUALITY = 0.72;

/** Aggressive settings for Spark plan (Firestore, no Cloud Storage) */
const SPARK_MAX = 900;
const SPARK_QUALITY = 0.55;
export const SPARK_MAX_IMAGE_BYTES = 180 * 1024;

/** Format bytes for display (e.g. "1.2 MB") */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compress an image file using canvas resize + JPEG encoding.
 * Non-image files are rejected — use direct upload for PDFs.
 */
export async function compressImageFile(
  file: File,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<CompressionResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files can be compressed with this utility.');
  }

  const maxWidth = options?.maxWidth ?? DEFAULT_MAX;
  const maxHeight = options?.maxHeight ?? DEFAULT_MAX;
  const quality = options?.quality ?? DEFAULT_QUALITY;

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Could not create canvas context.');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Image compression failed.'))),
      'image/jpeg',
      quality
    );
  });

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return {
    blob,
    originalSize: file.size,
    compressedSize: blob.size,
    fileName: `${baseName}.jpg`,
  };
}

/**
 * Extra-aggressive compression for Firebase Spark (no Cloud Storage).
 * Targets under ~180 KB per image so files live in Firestore, not Storage.
 */
export async function compressImageForSparkPlan(file: File): Promise<CompressionResult> {
  let quality = SPARK_QUALITY;
  let result = await compressImageFile(file, {
    maxWidth: SPARK_MAX,
    maxHeight: SPARK_MAX,
    quality,
  });

  while (result.compressedSize > SPARK_MAX_IMAGE_BYTES && quality > 0.35) {
    quality -= 0.08;
    result = await compressImageFile(file, {
      maxWidth: Math.round(SPARK_MAX * 0.85),
      maxHeight: Math.round(SPARK_MAX * 0.85),
      quality,
    });
  }

  if (result.compressedSize > SPARK_MAX_IMAGE_BYTES) {
    throw new Error(
      `Image still too large after compression (${formatFileSize(result.compressedSize)}). Try a smaller photo.`
    );
  }

  return result;
}

/** Max PDF on Spark — stored in Firestore when Storage is unavailable */
export const MAX_SPARK_ATTACHMENT_BYTES = 180 * 1024;

/** Max PDF/other attachment size when using Cloud Storage (Blaze) */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
