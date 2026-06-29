function iso(value: unknown): string | null {
  if (!value) return null;
  return new Date(value as string | number | Date).toISOString();
}

function parseDateOnly(value: unknown): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  return String(value);
}

module.exports = {
  iso,
  parseDateOnly
};

export {};
