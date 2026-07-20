const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function iso(value: string | number | Date): string | null {
  if (!value) return null;
  return new Date(value as string | number | Date).toISOString();
}

function parseDateOnly(value: string | number | Date): string | null {
  var dateToParse = String(value || '');
  if (!DATE_ONLY_REGEX.test(dateToParse)) return null;
  return dateToParse;
}

module.exports = {
  iso,
  parseDateOnly
};

export {};
