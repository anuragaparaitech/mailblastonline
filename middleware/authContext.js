const { getDb } = require('../database/db');

function authContext(req, res, next) {
  try {
    const rawUserId = req.headers['x-user-id'] || req.query.user_id;
    const db = getDb();

    let user = null;
    if (rawUserId) {
      user = db.prepare('SELECT id, name, email, role, department, status FROM users WHERE id = ?').get(rawUserId);
    }

    if (!user) {
      // Default to user 1 (Admin) for backward compatibility
      user = db.prepare('SELECT id, name, email, role, department, status FROM users WHERE id = 1').get() || {
        id: 1,
        name: 'Aparaitech Admin',
        email: 'admin@aparaitech.org',
        role: 'admin',
        department: 'Executive Management',
        status: 'active'
      };
    }

    req.user = user;
    req.isAdmin = (user.role === 'admin');
    req.isEmployee = (user.role === 'employee');
  } catch (err) {
    req.user = { id: 1, name: 'Admin', role: 'admin' };
    req.isAdmin = true;
    req.isEmployee = false;
  }
  next();
}

module.exports = authContext;
