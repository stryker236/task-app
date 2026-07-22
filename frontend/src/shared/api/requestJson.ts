export const DEFAULT_API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 60000);

const API_URL = import.meta.env.VITE_API_URL || '/api';

export type JsonRequestOptions = RequestInit & {
  headers?: HeadersInit;
  timeoutMs?: number;
};

export async function requestJson<T>(path: string, options: JsonRequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_API_TIMEOUT_MS, signal, ...requestOptions } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = timeoutMs > 0
    ? window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : 0;
  const abortRequest = () => controller.abort();
  const cleanupRequest = () => {
    if (timeoutId) window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortRequest);
  };

  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener('abort', abortRequest, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...requestOptions.headers },
      ...requestOptions,
      signal: controller.signal
    });
  } catch (error) {
    const message = timedOut
      ? `O pedido demorou mais de ${Math.round(timeoutMs / 1000)}s e foi cancelado.`
      : error instanceof Error
        ? error.message
        : 'O pedido falhou';
    window.dispatchEvent(new CustomEvent('task-app:api-error', {
      detail: { path, status: 0, requestId: '', error: message }
    }));
    cleanupRequest();
    throw new Error(message);
  }

  try {
    const requestId = response.headers.get('x-request-id') || '';
    if (response.status === 204) return null as T;
    const data = await response.json().catch((error) => {
      if (timedOut) throw error;
      return {} as { error?: string; details?: string[] };
    });
    if (!response.ok) {
      window.dispatchEvent(new CustomEvent('task-app:api-error', {
        detail: { path, status: response.status, requestId, error: data.error || 'O pedido falhou' }
      }));
      const details = data.details?.length ? `: ${data.details.join('; ')}` : '';
      throw new Error(`${data.error || 'O pedido falhou'}${details}`);
    }
    if (requestId) {
      window.dispatchEvent(new CustomEvent('task-app:api-response', {
        detail: { path, status: response.status, requestId }
      }));
    }
    return data as T;
  } catch (error) {
    if (timedOut) {
      const message = `O pedido demorou mais de ${Math.round(timeoutMs / 1000)}s e foi cancelado.`;
      window.dispatchEvent(new CustomEvent('task-app:api-error', {
        detail: { path, status: 0, requestId: '', error: message }
      }));
      throw new Error(message);
    }
    throw error;
  } finally {
    cleanupRequest();
  }
}
