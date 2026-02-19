const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authorization token missing.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user; // { id, email, role }
    next();
  });
}

/**
 * Middleware: requireAdmin
 * Restricts access to users with 'admin' or 'super_admin' roles.
 */
function requireAdmin(req, res, next) {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Access denied. Administrative privileges required.' });
    }
    next();
}

module.exports = {
  authenticateToken,
  requireAdmin
};


