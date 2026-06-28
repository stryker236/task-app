function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  return String(value);
}

module.exports = {
  iso,
  parseDateOnly
};
