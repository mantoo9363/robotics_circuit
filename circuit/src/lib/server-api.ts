const serverUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

export function serverApiUrl(path: string) {
  return `${serverUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function serverAssetUrl(path: string | null | undefined) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return serverApiUrl(path);
}
