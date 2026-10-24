// Middleware to extract client IP address accurately
function getClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',');
    return ips[0].trim();
  }
  return req.socket.remoteAddress || req.ip || '127.0.0.1';
}

// Authentication check
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

// Role-based Access Control (RBAC)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }
    const userRole = req.session.user.role;
    // admin inherits staff role
    if (roles.includes(userRole) || (roles.includes('staff') && userRole === 'admin')) {
      return next();
    }
    return res.status(403).render('error', {
      title: '403 - Không Có Quyền Truy Cập',
      message: 'Bạn không có quyền thực hiện chức năng này (Quyền yêu cầu: ' + roles.join(', ') + ').',
      user: req.session.user
    });
  };
}

module.exports = {
  getClientIp,
  requireAuth,
  requireRole,
};
