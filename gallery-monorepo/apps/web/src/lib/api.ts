'use client';

import type { ApiResponse } from '@sylvie/types';

const TOKEN_KEY = 'sylvie_token';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

function buildHeaders(init?: RequestOptions): Headers {
  const headers = new Headers(init?.headers);
  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init?.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(response.status, '服务返回了无法解析的数据');
  }

  const envelope = payload as ApiResponse<T> | null;
  if (!response.ok || !envelope || envelope.code >= 400) {
    throw new ApiError(
      envelope?.code ?? response.status,
      envelope?.message ?? `请求失败（${response.status}）`,
    );
  }
  return envelope.data;
}

/** 统一请求：自动附带 JWT，解包 { code, message, data }。 */
export async function apiFetch<T>(path: string, init?: RequestOptions): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: buildHeaders(init),
    body:
      init?.body === undefined || init?.body instanceof FormData
        ? (init?.body as FormData | undefined)
        : JSON.stringify(init?.body),
    cache: 'no-store',
  });
  return parseResponse<T>(response);
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: formData });
}

/** 带鉴权下载文件（用于 ZIP 整包下载）。 */
export async function downloadFile(path: string, fallbackName = 'download.zip'): Promise<void> {
  const response = await fetch(path, {
    headers: buildHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `下载失败（${response.status}）`;
    try {
      const payload = JSON.parse(text) as { message?: string };
      message = payload.message ?? message;
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const filename = utf8Match?.[1] ? decodeURIComponent(utf8Match[1]) : fallbackName;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
