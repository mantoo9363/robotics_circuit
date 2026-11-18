export const AUTH_TOKEN_KEY = 'circuit-studio-auth-token';
export const AUTH_USER_KEY = 'circuit-studio-auth-user';

type ApiErrorBody = {
  error?: unknown;
  message?: unknown;
  msg?: unknown;
};

export function getApiErrorMessage(data: unknown, fallback = 'Something went wrong') {
  if (!data || typeof data !== 'object') return fallback;
  const body = data as ApiErrorBody;
  const message = body.error || body.message || body.msg;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

export function isAuthenticationFailure(status?: number, data?: unknown) {
  if (status === 401) return true;

  const message = getApiErrorMessage(data, '').toLowerCase();
  return (
    message.includes('authentication required') ||
    message.includes('invalid or expired access token')
  );
}

export async function logoutClient() {
  // no-op: auth removed for vendored circuit module
  return;
}