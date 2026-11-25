export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) return false;
  if (url === 'your_supabase_url' || anonKey === 'your_supabase_anon_key') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  return true;
}

export function isSupabaseAdminConfigured(): boolean {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return (
    isSupabaseConfigured() &&
    Boolean(serviceKey) &&
    serviceKey !== 'your_service_role_key'
  );
}

export function isR2Configured(): boolean {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) return false;
  if (
    accountId === 'your_cloudflare_account_id' ||
    accessKeyId === 'your_r2_access_key' ||
    secretAccessKey === 'your_r2_secret_key'
  ) {
    return false;
  }
  return true;
}
