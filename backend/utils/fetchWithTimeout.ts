function numberFromEnv(value: string | undefined, fallback: number): number {
  const number = Number(value);

  return number > 0 && Number.isFinite(number)
    ? number
    : fallback;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
      (timeoutError as any).status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  fetchWithTimeout,
  numberFromEnv
};

export { };
