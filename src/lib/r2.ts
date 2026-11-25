import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isR2Configured } from '@/lib/supabase/config';

let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    const accountId = process.env.R2_ACCOUNT_ID!;
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return r2Client;
}

function sanitizeExt(filename: string, mimeType?: string): string {
  const extFromName = path.extname(filename || '').toLowerCase();
  if (extFromName && /^\.[a-z0-9]{1,8}$/.test(extFromName)) {
    return extFromName;
  }
  if (mimeType) {
    if (mimeType.includes('png')) return '.png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
    if (mimeType.includes('webp')) return '.webp';
    if (mimeType.includes('gif')) return '.gif';
    if (mimeType.includes('svg')) return '.svg';
    if (mimeType.includes('mp4')) return '.mp4';
    if (mimeType.includes('webm')) return '.webm';
  }
  return '.bin';
}

export function buildObjectKey(
  workspaceId: string,
  folder: string,
  filename: string,
  mimeType?: string
): string {
  const ext = sanitizeExt(filename, mimeType);
  const datePart = new Date().toISOString().slice(0, 10);
  const unique = crypto.randomBytes(6).toString('hex');
  return `${workspaceId}/${folder}/${datePart}/${unique}${ext}`;
}

export function buildR2PublicUrl(objectKey: string): string {
  const domain = (process.env.R2_PUBLIC_DOMAIN || '').trim().replace(/\/+$/, '');
  if (domain) {
    return `${domain}/${objectKey}`;
  }
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const bucket = process.env.R2_BUCKET_NAME || 'ai-workbench-assets';
  return `https://${bucket}.${accountId}.r2.dev/${objectKey}`;
}

export async function createPresignedUpload(params: {
  workspaceId: string;
  folder?: string;
  filename: string;
  contentType: string;
}): Promise<{
  mode: 'r2' | 'local';
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
}> {
  const objectKey = buildObjectKey(
    params.workspaceId,
    params.folder || 'uploads',
    params.filename,
    params.contentType
  );

  if (!isR2Configured()) {
    return {
      mode: 'local',
      uploadUrl: '/api/upload',
      publicUrl: `/uploads/${path.basename(objectKey)}`,
      objectKey,
    };
  }

  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME!;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: params.contentType || 'application/octet-stream',
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 600 });
  return {
    mode: 'r2',
    uploadUrl,
    publicUrl: buildR2PublicUrl(objectKey),
    objectKey,
  };
}

export async function uploadBufferToStorage(params: {
  workspaceId: string;
  folder?: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
}): Promise<{ url: string; storage: 'r2' | 'local'; objectKey: string }> {
  const objectKey = buildObjectKey(
    params.workspaceId,
    params.folder || 'uploads',
    params.filename,
    params.contentType
  );

  if (isR2Configured()) {
    const client = getR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: objectKey,
        Body: params.buffer,
        ContentType: params.contentType || 'application/octet-stream',
      })
    );
    return {
      url: buildR2PublicUrl(objectKey),
      storage: 'r2',
      objectKey,
    };
  }

  const localDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  const safeBasename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${sanitizeExt(
    params.filename,
    params.contentType
  )}`;
  const dest = path.join(localDir, safeBasename);
  fs.writeFileSync(dest, params.buffer);

  return {
    url: `/uploads/${safeBasename}`,
    storage: 'local',
    objectKey: safeBasename,
  };
}
