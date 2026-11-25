export async function uploadFileToCloud(
  file: File,
  workspaceId: string,
  folder = 'assets'
): Promise<{ url: string; storage: 'r2' | 'local' }> {
  // 1. Request presigned URL from /api/upload
  const presignRes = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'presign',
      workspaceId,
      folder,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
    }),
  });

  if (presignRes.ok) {
    const presignData = await presignRes.json();
    if (presignData.mode === 'r2' && presignData.uploadUrl) {
      try {
        const putRes = await fetch(presignData.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        });
        if (putRes.ok) {
          return { url: presignData.publicUrl, storage: 'r2' };
        }
      } catch {
        // Fallback to server-side multipart proxy if browser CORS isn't configured on R2 bucket
      }
    }
  }

  // 2. Multipart upload fallback (also handles local dev storage)
  const formData = new FormData();
  formData.append('file', file);
  formData.append('workspaceId', workspaceId);
  formData.append('folder', folder);

  const uploadRes = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  const data = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(data.error || '上传失败');
  }

  return { url: data.url, storage: data.storage || 'local' };
}
