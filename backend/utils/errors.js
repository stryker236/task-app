function createValidationError(details) {
  const error = new Error('Validation failed');
  error.status = 400;
  error.details = details;
  return error;
}

module.exports = {
  createValidationError
};
