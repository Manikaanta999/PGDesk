import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type StorageProviderKind = 'local_db' | 'local' | 'gcs' | 's3';

export interface StoredFileMeta {
  storageKey: string;
  sizeBytes: number;
  mimeType: string;
  fileName: string;
  provider: StorageProviderKind;
  externalUrl?: string | null;
  contentBase64?: string | null;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export interface StorageProvider {
  readonly providerName: StorageProviderKind;
  saveBase64File(params: {
    fileName: string;
    mimeType: string;
    base64Data: string;
    organizationId: number;
    folder: 'id-docs' | 'complaints' | 'receipts' | 'properties' | 'avatars';
  }): Promise<StoredFileMeta>;
  readFileBuffer(storageKey: string, contentBase64?: string | null): Promise<Buffer | null>;
  getSignedDownloadUrl?(storageKey: string, expiresSeconds?: number): Promise<string | null>;
}

function parseValidatedUpload(params: { fileName: string; mimeType: string; base64Data: string }) {
  if (!ALLOWED_MIME_TYPES.has(params.mimeType)) {
    throw new Error('Unsupported file type. Only JPEG, PNG, WebP, and PDF are allowed.');
  }
  const cleanedBase64 = params.base64Data.includes(',')
    ? params.base64Data.split(',')[1]
    : params.base64Data;
  const buffer = Buffer.from(cleanedBase64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error('File must be non-empty and under 5 MB.');
  }
  const safeExt =
    params.mimeType === 'application/pdf'
      ? 'pdf'
      : params.mimeType === 'image/png'
        ? 'png'
        : params.mimeType === 'image/webp'
          ? 'webp'
          : 'jpg';
  const safeFileName = params.fileName.replace(/[^\w.-]/g, '_');
  return { buffer, cleanedBase64, safeExt, safeFileName };
}

function buildStorageKey(organizationId: number, folder: string, ext: string): string {
  const randomId = crypto.randomBytes(12).toString('hex');
  return `org_${organizationId}/${folder}/${randomId}.${ext}`;
}

const UPLOAD_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

class LocalDiskAndDbStorageProvider implements StorageProvider {
  readonly providerName: StorageProviderKind;

  constructor(mode: 'local_db' | 'local') {
    this.providerName = mode;
  }

  async saveBase64File(params: {
    fileName: string;
    mimeType: string;
    base64Data: string;
    organizationId: number;
    folder: 'id-docs' | 'complaints' | 'receipts' | 'properties' | 'avatars';
  }): Promise<StoredFileMeta> {
    const { buffer, cleanedBase64, safeExt, safeFileName } = parseValidatedUpload(params);
    const storageKey = buildStorageKey(params.organizationId, params.folder, safeExt);
    const fullPath = path.join(UPLOAD_ROOT, storageKey);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    return {
      storageKey,
      sizeBytes: buffer.length,
      mimeType: params.mimeType,
      fileName: safeFileName,
      provider: this.providerName,
      contentBase64: this.providerName === 'local_db' ? cleanedBase64 : null,
      externalUrl: null,
    };
  }

  async readFileBuffer(storageKey: string, contentBase64?: string | null): Promise<Buffer | null> {
    const normalized = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(UPLOAD_ROOT, normalized);
    if (fullPath.startsWith(UPLOAD_ROOT)) {
      try {
        return await fs.readFile(fullPath);
      } catch {
        // Fall through to DB base64 backup in local_db mode
      }
    }
    if (contentBase64) {
      return Buffer.from(contentBase64, 'base64');
    }
    return null;
  }
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

class S3SignedStorageProvider implements StorageProvider {
  readonly providerName: StorageProviderKind = 's3';

  private getConfig() {
    const bucket = process.env.S3_BUCKET || '';
    const region = process.env.S3_REGION || 'ap-south-1';
    const endpoint = (process.env.S3_ENDPOINT || `https://s3.${region}.amazonaws.com`).replace(/\/$/, '');
    const accessKeyId = process.env.S3_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || '';
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('STORAGE_PROVIDER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.');
    }
    return { bucket, region, endpoint, accessKeyId, secretAccessKey };
  }

  private signPresignedUrl(method: 'GET' | 'PUT', storageKey: string, expiresSeconds = 900): string {
    const { bucket, region, endpoint, accessKeyId, secretAccessKey } = this.getConfig();
    const url = new URL(`${endpoint}/${bucket}/${storageKey}`);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    url.searchParams.set('X-Amz-Credential', `${accessKeyId}/${credentialScope}`);
    url.searchParams.set('X-Amz-Date', amzDate);
    url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
    url.searchParams.set('X-Amz-SignedHeaders', 'host');

    const sortedParams = Array.from(url.searchParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const canonicalRequest = [
      method,
      url.pathname,
      sortedParams,
      `host:${url.host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
    const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, region);
    const kService = hmacSha256(kRegion, 's3');
    const kSigning = hmacSha256(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    url.searchParams.set('X-Amz-Signature', signature);
    return url.toString();
  }

  async saveBase64File(params: {
    fileName: string;
    mimeType: string;
    base64Data: string;
    organizationId: number;
    folder: 'id-docs' | 'complaints' | 'receipts' | 'properties' | 'avatars';
  }): Promise<StoredFileMeta> {
    const { buffer, safeExt, safeFileName } = parseValidatedUpload(params);
    const storageKey = buildStorageKey(params.organizationId, params.folder, safeExt);
    const uploadUrl = this.signPresignedUrl('PUT', storageKey, 300);

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': params.mimeType },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      throw new Error(`S3 upload failed (${res.status})`);
    }

    return {
      storageKey,
      sizeBytes: buffer.length,
      mimeType: params.mimeType,
      fileName: safeFileName,
      provider: 's3',
      contentBase64: null, // Never store binary data in Postgres in S3 mode
      externalUrl: `s3://${process.env.S3_BUCKET}/${storageKey}`,
    };
  }

  async getSignedDownloadUrl(storageKey: string, expiresSeconds = 600): Promise<string | null> {
    return this.signPresignedUrl('GET', storageKey, expiresSeconds);
  }

  async readFileBuffer(storageKey: string): Promise<Buffer | null> {
    const signedUrl = await this.getSignedDownloadUrl(storageKey, 300);
    if (!signedUrl) return null;
    const res = await fetch(signedUrl);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }
}

class GcsSignedStorageProvider implements StorageProvider {
  readonly providerName: StorageProviderKind = 'gcs';

  private getConfig() {
    const bucket = process.env.GCS_BUCKET || '';
    const clientEmail = process.env.GCS_CLIENT_EMAIL || '';
    const privateKey = (process.env.GCS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const endpoint = (process.env.GCS_ENDPOINT || 'https://storage.googleapis.com').replace(/\/$/, '');
    if (!bucket || !clientEmail || !privateKey) {
      throw new Error('STORAGE_PROVIDER=gcs requires GCS_BUCKET, GCS_CLIENT_EMAIL, and GCS_PRIVATE_KEY.');
    }
    return { bucket, clientEmail, privateKey, endpoint };
  }

  private signV4Url(method: 'GET' | 'PUT', storageKey: string, expiresSeconds = 900): string {
    const { bucket, clientEmail, privateKey } = this.getConfig();
    const host = 'storage.googleapis.com';
    const canonicalUri = `/${bucket}/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/auto/storage/goog4_request`;

    const queryParams = new URLSearchParams({
      'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
      'X-Goog-Credential': `${clientEmail}/${credentialScope}`,
      'X-Goog-Date': amzDate,
      'X-Goog-Expires': String(expiresSeconds),
      'X-Goog-SignedHeaders': 'host',
    });

    const canonicalQuery = Array.from(queryParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      `host:${host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = ['GOOG4-RSA-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(stringToSign);
    const signature = signer.sign(privateKey, 'hex');

    return `https://${host}${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signature}`;
  }

  async saveBase64File(params: {
    fileName: string;
    mimeType: string;
    base64Data: string;
    organizationId: number;
    folder: 'id-docs' | 'complaints' | 'receipts' | 'properties' | 'avatars';
  }): Promise<StoredFileMeta> {
    const { buffer, safeExt, safeFileName } = parseValidatedUpload(params);
    const storageKey = buildStorageKey(params.organizationId, params.folder, safeExt);
    const putUrl = this.signV4Url('PUT', storageKey, 300);

    const res = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': params.mimeType },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      throw new Error(`GCS upload failed (${res.status})`);
    }

    return {
      storageKey,
      sizeBytes: buffer.length,
      mimeType: params.mimeType,
      fileName: safeFileName,
      provider: 'gcs',
      contentBase64: null, // Never store binary data in Postgres in GCS mode
      externalUrl: `gs://${process.env.GCS_BUCKET}/${storageKey}`,
    };
  }

  async getSignedDownloadUrl(storageKey: string, expiresSeconds = 600): Promise<string | null> {
    return this.signV4Url('GET', storageKey, expiresSeconds);
  }

  async readFileBuffer(storageKey: string): Promise<Buffer | null> {
    const signedUrl = await this.getSignedDownloadUrl(storageKey, 300);
    if (!signedUrl) return null;
    const res = await fetch(signedUrl);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }
}

export function resolveStorageProvider(providerEnv?: string): StorageProvider {
  const kind = (providerEnv || process.env.STORAGE_PROVIDER || process.env.STORAGE_DRIVER || 'local_db')
    .trim()
    .toLowerCase();
  if (kind === 's3') return new S3SignedStorageProvider();
  if (kind === 'gcs') return new GcsSignedStorageProvider();
  if (kind === 'local') return new LocalDiskAndDbStorageProvider('local');
  return new LocalDiskAndDbStorageProvider('local_db');
}

export const storageService: StorageProvider = resolveStorageProvider();
