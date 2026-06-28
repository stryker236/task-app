function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeString).filter(Boolean))];
}

function containsText(value, query) {
  return String(value || '').toLocaleLowerCase().includes(String(query || '').toLocaleLowerCase());
}

module.exports = {
  normalizeString,
  normalizeArray,
  containsText
};
