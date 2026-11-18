import type { ApiResponse } from '@sylvie/types';

const TOKEN_KEY = 'sylvie_admin_token';

export class AdminApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY);
}

export function storeAdminToken(token: string, remember: boolean): void {
  if (remember) {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.sessionStorage.removeItem(TOKEN_KEY);
  } else {
    window.sessionStorage.setItem(TOKEN_KEY, token);
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearAdminToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipUnauthorizedEvent?: boolean;
}

function normalizePath(path: string): string {
  if (path.startsWith('/api/')) {
    return path;
  }
  return `/api/admin${path.startsWith('/') ? path : `/${path}`}`;
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new AdminApiError(response.status, '服务返回了无法解析的数据');
  }
  const envelope = payload as ApiResponse<T> | null;
  if (!response.ok || !envelope || envelope.code >= 400) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sylvie-admin-unauthorized'));
    }
    throw new AdminApiError(
      envelope?.code ?? response.status,
      envelope?.message ?? `请求失败（${response.status}）`,
    );
  }
  return envelope.data;
}

export async function adminFetch<T>(path: string, init?: RequestOptions): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = getAdminToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init?.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(normalizePath(path), {
    ...init,
    headers,
    body:
      init?.body === undefined || init.body instanceof FormData
        ? (init?.body as FormData | undefined)
        : JSON.stringify(init?.body),
    cache: 'no-store',
  });
  return parse<T>(response);
}

export async function adminUpload<T>(path: string, formData: FormData): Promise<T> {
  return adminFetch<T>(path, { method: 'POST', body: formData });
}

/** 下载后台导出的 CSV，返回是否成功。 */
export async function adminDownload(path: string, fallbackName: string): Promise<boolean> {
  const headers = new Headers();
  const token = getAdminToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(normalizePath(path), { headers, cache: 'no-store' });
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) {
    const text = await response.text();
    let message = `导出失败（${response.status}）`;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {
      // ignore
    }
    throw new AdminApiError(response.status, message);
  }
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as ApiResponse<{ count: number }>;
    if ((payload.data?.count ?? 0) === 0) {
      throw new AdminApiError(400, '当前筛选结果为空，未生成文件');
    }
    return false;
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const filename = match?.[1] ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}
