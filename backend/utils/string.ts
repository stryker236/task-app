function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArray(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [];
  return [...new Set(items.map(normalizeString).filter((item): item is string => Boolean(item)))];
}

function containsText(value: string, query: string): boolean {
  return value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

module.exports = {
  normalizeString,
  normalizeArray,
  containsText
};

export { };
