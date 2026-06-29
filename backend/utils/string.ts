function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeString).filter((item): item is string => Boolean(item)))];
}

function containsText(value: unknown, query: unknown): boolean {
  return String(value || '').toLocaleLowerCase().includes(String(query || '').toLocaleLowerCase());
}

module.exports = {
  normalizeString,
  normalizeArray,
  containsText
};

export {};
