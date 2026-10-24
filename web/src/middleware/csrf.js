const crypto = require('crypto');

function csrfProtection(req, res, next) {
  // Generate token if not already in session
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }

  // Make csrfToken available to all EJS templates
  res.locals.csrfToken = req.session.csrfToken;

  // Safe HTTP methods do not require CSRF token validation
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Exempt internal healthcheck
  if (req.path === '/health') {
    return next();
  }

  // Multipart requests have not yet had req.body parsed by multer; defer validation
  if (req.is('multipart/form-data')) {
    return next();
  }

  // Check token from body, query or headers
  const token = (req.body && req.body._csrf) || (req.query && req.query._csrf) || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).render('error', {
      title: '403 - Lỗi CSRF Token',
      message: 'Yêu cầu không hợp lệ hoặc phiên làm việc đã hết hạn. Vui lòng tải lại trang.',
      user: req.session ? req.session.user : null
    });
  }

  next();
}

module.exports = csrfProtection;
