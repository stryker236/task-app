function normalizeString(value: string): string {
  return value.trim();
}

function normalizeArray(value: string[]): string[] {
  return [...new Set(value.map(normalizeString).filter((item): item is string => Boolean(item)))];
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
