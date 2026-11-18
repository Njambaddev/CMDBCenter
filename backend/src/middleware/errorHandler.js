class ApiError extends Error {
  constructor(statusCode, message, code = 'API_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function redactSensitive(text = '') {
  return String(text)
    .replace(/("?(?:Password|SessionID|UserPw)"?\s*[:=]\s*"?)[^"&,\s}]+/gi, '$1[REDACTED]')
    .replace(/(SessionID=)[^&\s]+/gi, '$1[REDACTED]');
}

function errorHandler(err, req, res, _next) {
  const status = err.statusCode || 500;
  const safeMessage = redactSensitive(err.message || 'Internal server error');
  const code = err.code || 'INTERNAL_ERROR';

  if (status >= 500) {
    console.error(`[API Error] ${req.method} ${req.originalUrl} -> ${status} (${code}): ${safeMessage}`);
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message: safeMessage,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}

module.exports = {
  ApiError,
  redactSensitive,
  errorHandler,
};
