import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase';
import { stripUndefinedForFirestore } from './firestoreSanitize';
import { compressImageForSparkPlan } from '../utils/imageCompression';

export type TaskFileCategory =
  | 'before'
  | 'after'
  | 'progress'
  | 'attachments'
  | 'expense_receipt'
  | 'project_gallery';

/**
 * Storage mode:
 * - `firestore` (default): Spark plan — images in Firestore `project_task_media` (no Blaze/card needed)
 * - `firebase`: Blaze plan — Firebase Cloud Storage
 */
export type TaskMediaBackend = 'firestore' | 'firebase';

function getBackend(): TaskMediaBackend {
  const mode = import.meta.env.VITE_TASK_MEDIA_BACKEND as TaskMediaBackend | undefined;
  return mode === 'firebase' ? 'firebase' : 'firestore';
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(blob);
  });
}

/** Firestore documents must stay under 1 MiB; base64 adds ~33% overhead. */
const FIRESTORE_MEDIA_MAX_ENCODED_CHARS = 750_000;

function integerByteSize(blob: Blob): number {
  return Math.max(0, Math.floor(blob.size));
}

/** Turn Firebase / storage errors into short user-facing messages */
export function formatMediaUploadError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  const message = err instanceof Error ? err.message : String(err);

  if (code === 'permission-denied' || message.includes('PERMISSION_DENIED')) {
    return 'Permission denied. Open the project once (or ask the owner to) so member access can sync, then try the upload again.';
  }
  if (code === 'invalid-argument' || message.toLowerCase().includes('longer than')) {
    return 'Receipt image is too large for the free plan. Try a smaller or simpler photo.';
  }
  if (message.includes('too large')) return message;
  return 'Could not upload receipt. Please try again.';
}

/** Save image/file to Firestore (free Spark plan — no Cloud Storage required) */
async function uploadToFirestore(
  projectId: string,
  taskId: string,
  category: TaskFileCategory,
  file: Blob,
  fileName: string,
  mimeType: string
): Promise<{ url: string; storagePath: string; sizeBytes: number }> {
  const sizeBytes = integerByteSize(file);
  if (sizeBytes <= 0 || sizeBytes >= 200_000) {
    throw new Error('Receipt image is too large for the free plan. Try a smaller photo.');
  }

  const dataUrl = await blobToDataUrl(file);
  if (dataUrl.length > FIRESTORE_MEDIA_MAX_ENCODED_CHARS) {
    throw new Error('Receipt image is too large after encoding. Try a smaller or simpler photo.');
  }

  const mediaId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `firestore:project_task_media/${mediaId}`;

  await setDoc(doc(db, 'project_task_media', mediaId), stripUndefinedForFirestore({
    projectId,
    taskId,
    category,
    fileName,
    mimeType,
    sizeBytes,
    uploadDate: new Date().toISOString(),
    dataUrl,
  }));

  return { url: dataUrl, storagePath, sizeBytes };
}

/** Save to Firebase Cloud Storage (requires Blaze billing plan) */
async function uploadToFirebaseStorage(
  projectId: string,
  taskId: string,
  category: TaskFileCategory,
  file: Blob,
  fileName: string
): Promise<{ url: string; storagePath: string; sizeBytes: number }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `projects/${projectId}/tasks/${taskId}/${category}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, storagePath, sizeBytes: integerByteSize(file) };
}

/**
 * Upload task media. Defaults to Firestore (Spark/free). Set VITE_TASK_MEDIA_BACKEND=firebase for Blaze + Storage.
 */
export async function uploadProjectTaskFile(
  projectId: string,
  taskId: string,
  category: TaskFileCategory,
  file: Blob,
  fileName: string,
  mimeType = 'image/jpeg'
): Promise<{ url: string; storagePath: string; sizeBytes: number }> {
  if (getBackend() === 'firebase') {
    try {
      return await uploadToFirebaseStorage(projectId, taskId, category, file, fileName);
    } catch (err) {
      console.warn('Firebase Storage failed, falling back to Firestore:', err);
    }
  }
  return uploadToFirestore(projectId, taskId, category, file, fileName, mimeType);
}

/** Upload a project-level gallery image without embedding it in the project document. */
export async function uploadProjectGalleryImage(
  projectId: string,
  file: Blob,
  fileName: string,
  mimeType = 'image/jpeg'
): Promise<{ url: string; storagePath: string; sizeBytes: number }> {
  return uploadProjectTaskFile(
    projectId,
    '_project_gallery',
    'project_gallery',
    file,
    fileName,
    mimeType
  );
}

/** Upload a supplier receipt / bon image for an expense */
export async function uploadExpenseReceipt(
  projectId: string,
  expenseId: string,
  file: Blob,
  fileName: string,
  mimeType = 'image/jpeg'
): Promise<{ url: string; storagePath: string; sizeBytes: number }> {
  let blob = file;
  let name = fileName;
  let type = mimeType;

  // Re-compress on upload when using Firestore (Spark) so rules + doc size limits are met
  if (getBackend() !== 'firebase') {
    const imageFile =
      file instanceof File
        ? file
        : new File([file], fileName, { type: mimeType || 'image/jpeg' });
    if (imageFile.type.startsWith('image/')) {
      const compressed = await compressImageForSparkPlan(imageFile);
      blob = compressed.blob;
      name = compressed.fileName;
      type = compressed.blob.type || 'image/jpeg';
    }
  }

  return uploadProjectTaskFile(projectId, expenseId, 'expense_receipt', blob, name, type);
}

/** Load display URL for a media reference (lazy load for Firestore-backed files) */
export async function resolveTaskMediaUrl(storagePath: string, cachedUrl?: string): Promise<string> {
  if (cachedUrl && cachedUrl.startsWith('data:')) return cachedUrl;
  if (cachedUrl && cachedUrl.startsWith('http')) return cachedUrl;

  if (storagePath.startsWith('firestore:project_task_media/')) {
    const mediaId = storagePath.replace('firestore:project_task_media/', '');
    const snap = await getDoc(doc(db, 'project_task_media', mediaId));
    return (snap.data()?.dataUrl as string) || '';
  }

  if (storagePath.startsWith('projects/')) {
    return getDownloadURL(ref(storage, storagePath));
  }

  return cachedUrl || '';
}

/** Remove media from Firestore or Cloud Storage */
export async function deleteStorageFileStrict(storagePath: string): Promise<void> {
  if (!storagePath) return;

  if (storagePath.startsWith('firestore:project_task_media/')) {
    const mediaId = storagePath.replace('firestore:project_task_media/', '');
    await deleteDoc(doc(db, 'project_task_media', mediaId));
    return;
  }

  await deleteObject(ref(storage, storagePath));
}

/** Best-effort removal for interactive media controls that already update local state. */
export async function deleteStorageFile(storagePath: string): Promise<void> {
  try {
    await deleteStorageFileStrict(storagePath);
  } catch (err) {
    console.warn('Storage delete failed:', storagePath, err);
  }
}

/** Strip inline data URLs before saving project doc — keeps Firestore project document small */
export function stripTaskMediaUrlsForSave<T extends { storagePath: string; url?: string }>(items: T[]): T[] {
  return items.map((item) => {
    if (item.storagePath.startsWith('firestore:')) {
      const { url: _removed, ...rest } = item;
      return { ...rest, url: '' } as T;
    }
    return item;
  });
}

export function isUsingFirestoreMedia(): boolean {
  return getBackend() !== 'firebase';
}
