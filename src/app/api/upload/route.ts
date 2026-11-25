import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { createPresignedUpload, uploadBufferToStorage } from '@/lib/r2';
import { ensureUserWorkspaces, getAuthContext } from '@/lib/store/server-store';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const contentTypeHeader = request.headers.get('content-type') || '';

    // 1. Multipart form-data direct upload
    if (contentTypeHeader.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: '未检测到上传文件' }, { status: 400 });
      }

      const mime = file.type || '';
      const isImage = mime.startsWith('image/');
      const isVideo = mime.startsWith('video/');
      if (!isImage && !isVideo) {
        return NextResponse.json(
          { error: '仅支持上传图片（PNG/JPG/WEBP）或视频（MP4/WEBM）格式文件' },
          { status: 400 }
        );
      }

      const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (file.size > maxBytes) {
        return NextResponse.json(
          {
            error: isVideo
              ? '视频文件大小不能超过 100MB'
              : '图片文件大小不能超过 15MB',
          },
          { status: 400 }
        );
      }

      let workspaceId = String(formData.get('workspaceId') || '');
      if (!workspaceId) {
        const list = await ensureUserWorkspaces(ctx);
        workspaceId = list[0]?.id || 'default';
      }

      const folder = String(formData.get('folder') || 'assets');
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const saved = await uploadBufferToStorage({
        workspaceId,
        folder,
        filename: file.name || (isVideo ? 'upload.mp4' : 'upload.png'),
        contentType: mime,
        buffer,
      });

      return NextResponse.json({
        ok: true,
        url: saved.url,
        storage: saved.storage,
        objectKey: saved.objectKey,
      });
    }

    // 2. JSON actions: presign | transfer
    const body = await request.json();
    const action = String(body.action || 'presign');
    let workspaceId = String(body.workspaceId || '');
    if (!workspaceId) {
      const list = await ensureUserWorkspaces(ctx);
      workspaceId = list[0]?.id || 'default';
    }

    if (action === 'presign') {
      const filename = String(body.filename || 'asset.png');
      const contentType = String(body.contentType || 'application/octet-stream');
      const folder = String(body.folder || 'assets');
      const presigned = await createPresignedUpload({
        workspaceId,
        folder,
        filename,
        contentType,
      });
      return NextResponse.json(presigned);
    }

    if (action === 'transfer') {
      const sourceUrl = String(body.sourceUrl || '').trim();
      if (!sourceUrl) {
        return NextResponse.json({ error: '缺少 sourceUrl' }, { status: 400 });
      }

      // Allow only local /uploads/... or http(s):// URLs
      const isLocalUpload = sourceUrl.startsWith('/uploads/');
      const isHttpUrl = /^https?:\/\//i.test(sourceUrl);
      if (!isLocalUpload && !isHttpUrl) {
        return NextResponse.json(
          { error: '不支持的源媒体 URL 协议，仅允许 http(s) 或本地上传路径' },
          { status: 400 }
        );
      }

      if (isLocalUpload) {
        const publicRoot = path.resolve(process.cwd(), 'public');
        const localFilePath = path.resolve(publicRoot, sourceUrl.replace(/^\/+/, ''));
        if (!localFilePath.startsWith(publicRoot)) {
          return NextResponse.json({ error: '非法文件路径' }, { status: 400 });
        }
        if (fs.existsSync(localFilePath)) {
          const buffer = fs.readFileSync(localFilePath);
          const ext = path.extname(localFilePath) || '.png';
          const mime =
            ext === '.svg'
              ? 'image/svg+xml'
              : ext === '.mp4'
                ? 'video/mp4'
                : ext === '.webp'
                  ? 'image/webp'
                  : 'image/png';
          const saved = await uploadBufferToStorage({
            workspaceId,
            folder: 'studio-archived',
            filename: path.basename(localFilePath),
            contentType: mime,
            buffer,
          });
          return NextResponse.json({ ok: true, url: saved.url, storage: saved.storage });
        }
        return NextResponse.json({ ok: true, url: sourceUrl, storage: 'local' });
      }

      const remoteRes = await fetch(sourceUrl);
      if (!remoteRes.ok) {
        return NextResponse.json(
          { error: `拉取远程媒体失败 (${remoteRes.status})` },
          { status: 502 }
        );
      }

      const contentType =
        remoteRes.headers.get('content-type') ||
        (body.mediaType === 'video' ? 'video/mp4' : 'image/png');
      const arr = await remoteRes.arrayBuffer();
      const buffer = Buffer.from(arr);

      const saved = await uploadBufferToStorage({
        workspaceId,
        folder: 'studio-archived',
        filename: String(body.filename || (body.mediaType === 'video' ? 'video.mp4' : 'image.png')),
        contentType,
        buffer,
      });

      return NextResponse.json({
        ok: true,
        url: saved.url,
        storage: saved.storage,
        objectKey: saved.objectKey,
      });
    }

    return NextResponse.json({ error: '不支持的上传操作' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '上传处理失败' },
      { status: 500 }
    );
  }
}
