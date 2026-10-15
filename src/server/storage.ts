import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';
import { validationError } from '@/lib/errors';

/**
 * File storage.
 *
 * The local driver writes outside the web root and is served only through an
 * authorized API route, so an uploaded document is never reachable by guessing
 * a URL. The S3-compatible driver is the production path; it is selected by
 * `STORAGE_DRIVER=s3` and is a drop-in for the same interface.
 */

export interface StoredFile {
  storedName: string;
  sizeBytes: number;
  checksum: string;
  mimeType: string;
}

export interface StorageDriver {
  put(buffer: Buffer, options: { fileName: string; mimeType: string }): Promise<StoredFile>;
  get(storedName: string): Promise<Buffer>;
  delete(storedName: string): Promise<void>;
}

/** Extensions and MIME types the academy accepts for uploads. */
export const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'application/zip': ['.zip'],
};

/** Magic-byte signatures for formats where a spoofed extension is a real risk. */
const MAGIC_NUMBERS: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK..
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
];

export interface UploadValidation {
  ok: boolean
  error?: string;
}

/**
 * Validate an upload before it is written.
 *
 * Checks the declared MIME type against the allow-list, confirms the file
 * extension agrees with it, enforces the size limit, and — for the formats
 * where content sniffing matters — verifies the leading bytes so a `.pdf`
 * cannot actually be an executable.
 */
export function validateUpload(options: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer?: Buffer;
}): UploadValidation {
  const maxBytes = env.STORAGE_MAX_FILE_MB * 1024 * 1024;

  if (options.sizeBytes <= 0) {
    return { ok: false, error: 'The file is empty.' };
  }

  if (options.sizeBytes > maxBytes) {
    return {
      ok: false,
      error: `The file is larger than the ${env.STORAGE_MAX_FILE_MB} MB limit.`,
    };
  }

  const extension = path.extname(options.fileName).toLowerCase();

  // A path separator in the name is an attempt to escape the storage directory.
  if (options.fileName.includes('/') || options.fileName.includes('\\') || options.fileName.includes('..')) {
    return { ok: false, error: 'The file name contains invalid characters.' };
  }

  const allowedExtensions = ALLOWED_UPLOAD_TYPES[options.mimeType];

  if (!allowedExtensions) {
    return {
      ok: false,
      error: `Files of type "${options.mimeType}" are not accepted. Allowed types: PDF, Word, Excel, PowerPoint, images, plain text, CSV and ZIP.`,
    };
  }

  if (!allowedExtensions.includes(extension)) {
    return {
      ok: false,
      error: `A ${options.mimeType} file must use one of these extensions: ${allowedExtensions.join(', ')}.`,
    };
  }

  if (options.buffer && options.buffer.length >= 4) {
    const signature = MAGIC_NUMBERS.find((entry) => entry.mime === options.mimeType);

    if (signature) {
      const offset = signature.offset ?? 0;
      const matches = signature.bytes.every(
        (byte, i) => options.buffer![offset + i] === byte,
      );

      if (!matches) {
        return {
          ok: false,
          error: 'The file contents do not match its declared type.',
        };
      }
    }
  }

  return { ok: true };
}

/** Reject an upload that fails validation. */
export function assertValidUpload(options: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer?: Buffer;
}): void {
  const result = validateUpload(options);
  if (!result.ok) throw validationError(result.error ?? 'The file could not be accepted.');
}

function safeStoredName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const date = new Date();
  const folder = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${folder}/${randomUUID()}${extension}`;
}

class LocalStorageDriver implements StorageDriver {
  private readonly root = path.resolve(env.STORAGE_LOCAL_DIR);

  private resolve(storedName: string): string {
    const target = path.resolve(this.root, storedName);

    // Defence in depth: even though storedName is generated, never allow a
    // resolved path to escape the storage root.
    if (!target.startsWith(this.root + path.sep)) {
      throw validationError('Invalid storage path.');
    }
    return target;
  }

  async put(buffer: Buffer, options: { fileName: string; mimeType: string }): Promise<StoredFile> {
    assertValidUpload({
      fileName: options.fileName,
      mimeType: options.mimeType,
      sizeBytes: buffer.length,
      buffer,
    });

    const storedName = safeStoredName(options.fileName);
    const target = this.resolve(storedName);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer, { mode: 0o600 });

    return {
      storedName,
      sizeBytes: buffer.length,
      checksum: createHash('sha256').update(buffer).digest('hex'),
      mimeType: options.mimeType,
    };
  }

  async get(storedName: string): Promise<Buffer> {
    return readFile(this.resolve(storedName));
  }

  async delete(storedName: string): Promise<void> {
    try {
      await unlink(this.resolve(storedName));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

/**
 * S3-compatible driver.
 *
 * Implemented with signed fetch requests rather than an SDK so the deployment
 * does not need an extra dependency. Enable with STORAGE_DRIVER=s3 and the
 * S3_* variables.
 */
class S3StorageDriver implements StorageDriver {
  async put(buffer: Buffer, options: { fileName: string; mimeType: string }): Promise<StoredFile> {
    assertValidUpload({
      fileName: options.fileName,
      mimeType: options.mimeType,
      sizeBytes: buffer.length,
      buffer,
    });

    const storedName = safeStoredName(options.fileName);
    const url = `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET}/${storedName}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': options.mimeType,
        'Content-Length': String(buffer.length),
        // Credentials are supplied by the deployment's request signer or
        // reverse proxy; see docs/DEPLOYMENT.md.
        'x-amz-acl': 'private',
      },
      body: new Uint8Array(buffer),
    });

    if (!response.ok) {
      throw new Error(`Object storage rejected the upload (HTTP ${response.status}).`);
    }

    return {
      storedName,
      sizeBytes: buffer.length,
      checksum: createHash('sha256').update(buffer).digest('hex'),
      mimeType: options.mimeType,
    };
  }

  async get(storedName: string): Promise<Buffer> {
    const url = `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET}/${storedName}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Object storage returned HTTP ${response.status}.`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async delete(storedName: string): Promise<void> {
    const url = `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET}/${storedName}`;
    await fetch(url, { method: 'DELETE' });
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  driver = env.STORAGE_DRIVER === 's3' ? new S3StorageDriver() : new LocalStorageDriver();
  return driver;
}

/** Human-readable storage status for the admin system screen. */
export function storageStatus() {
  return {
    driver: env.STORAGE_DRIVER,
    localDir: env.STORAGE_DRIVER === 'local' ? env.STORAGE_LOCAL_DIR : null,
    maxFileMb: env.STORAGE_MAX_FILE_MB,
    acceptedTypes: Object.keys(ALLOWED_UPLOAD_TYPES),
    s3Configured: Boolean(env.S3_ENDPOINT && env.S3_BUCKET),
  };
}

/** Suggested `accept` attribute for file inputs. */
export function uploadAcceptAttribute(): string {
  return Array.from(
    new Set(Object.values(ALLOWED_UPLOAD_TYPES).flat()),
  ).join(',');
}
