type ValidationError = Error & {
  status: number;
  details: unknown;
};

function createValidationError(details: unknown): ValidationError {
  const error = new Error('Validation failed') as ValidationError;
  error.status = 400;
  error.details = details;
  return error;
}

module.exports = {
  createValidationError
};

export {};
