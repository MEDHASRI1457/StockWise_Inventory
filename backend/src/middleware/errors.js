function errorHandler(error, req, res, _next) {
  console.error(error);
  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: 'Validation failed.', details: Object.values(error.errors).map((item) => item.message) });
  }
  if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid identifier or value.' });
  if (error.code === 11000) return res.status(409).json({ message: 'A record with these unique details already exists.' });
  const status = Number.isInteger(error.status) ? error.status : 500;
  return res.status(status).json({ message: status >= 500 ? 'Unexpected server error.' : error.message });
}

module.exports = errorHandler;
