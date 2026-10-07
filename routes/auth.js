const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

const MAX_EMPLOYEES = 50;

/**
 * Helper to get currently active employees count
 */
function getActiveEmployeesCount(db) {
  const row = db.prepare("SELECT count(*) as count FROM users WHERE role = 'employee' AND status = 'active'").get();
  return row ? row.count : 0;
}

// POST /api/auth/login - Authenticate Admin or Employee
router.post('/login', (req, res) => {
  try {
    const db = getDb();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = db.prepare('SELECT id, name, email, password, role, department, status FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Your account is deactivated. Please contact the administrator.' });
    }

    if (user.password !== password.trim()) {
      return res.status(401).json({ success: false, message: 'Invalid password. Please check your credentials.' });
    }

    const { password: _, ...safeUser } = user;
    res.json({
      success: true,
      message: `Welcome back, ${safeUser.name}!`,
      user: safeUser
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/auth/me - Current user session details
router.get('/me', (req, res) => {
  try {
    const db = getDb();
    const userId = req.headers['x-user-id'] || req.query.user_id || 1;
    const user = db.prepare('SELECT id, name, email, role, department, status FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User session not found.' });
    }

    const activeEmployees = getActiveEmployeesCount(db);
    res.json({
      success: true,
      user,
      maxEmployees: MAX_EMPLOYEES,
      activeEmployees,
      remainingSlots: Math.max(0, MAX_EMPLOYEES - activeEmployees)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/auth/users - List all users / employees with quotas and metrics
router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const activeEmployees = getActiveEmployeesCount(db);

    const users = db.prepare(`
      SELECT 
        u.id, u.name, u.email, u.role, u.department, u.status, u.created_at,
        (SELECT COUNT(*) FROM students s WHERE s.user_id = u.id) as student_count,
        (SELECT COUNT(*) FROM smtp_accounts sa WHERE sa.user_id = u.id) as smtp_count,
        (SELECT COUNT(*) FROM campaigns c WHERE c.user_id = u.id) as campaign_count
      FROM users u
      ORDER BY 
        CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END,
        u.id ASC
    `).all();

    res.json({
      success: true,
      users,
      maxEmployees: MAX_EMPLOYEES,
      activeEmployees,
      remainingSlots: Math.max(0, MAX_EMPLOYEES - activeEmployees)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/users - Admin adds new Employee (strictly max 50 employees)
router.post('/users', (req, res) => {
  try {
    const db = getDb();
    const { name, email, password, department = 'Campus Recruitment', role = 'employee' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Full name, email address, and password are required.' });
    }

    // Enforce 50 employees maximum limit
    if (role === 'employee') {
      const activeCount = getActiveEmployeesCount(db);
      if (activeCount >= MAX_EMPLOYEES) {
        return res.status(400).json({
          success: false,
          message: `Maximum capacity reached: System is limited to exactly ${MAX_EMPLOYEES} employees. Please deactivate or remove an existing employee before adding a new one.`
        });
      }
    }

    // Check email uniqueness
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (existing) {
      return res.status(400).json({ success: false, message: `An account with email ${email.trim()} already exists.` });
    }

    const insertResult = db.prepare(`
      INSERT INTO users (name, email, password, role, department, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(name.trim(), email.trim(), password.trim(), role, department.trim());

    const newUserId = insertResult.lastInsertRowid;
    const createdUser = db.prepare('SELECT id, name, email, role, department, status, created_at FROM users WHERE id = ?').get(newUserId);

    // Provide default initial SMTP configuration placeholder for the new employee
    db.prepare(`
      INSERT INTO smtp_accounts (user_id, name, host, port, secure, user, pass, from_name, from_email, reply_to, daily_limit, sent_today, is_active, priority)
      VALUES (?, ?, 'smtp.gmail.com', 587, 0, ?, '', ?, ?, 'careers@aparaitech.org', 500, 0, 1, 1)
    `).run(
      newUserId,
      `${name.trim()} Sender`,
      email.trim(),
      `${name.trim()} | Aparaitech Recruitment`,
      email.trim()
    );

    const activeEmployees = getActiveEmployeesCount(db);

    res.status(201).json({
      success: true,
      message: `Employee "${name.trim()}" added successfully! (${activeEmployees}/${MAX_EMPLOYEES} slots used)`,
      user: createdUser,
      maxEmployees: MAX_EMPLOYEES,
      activeEmployees,
      remainingSlots: Math.max(0, MAX_EMPLOYEES - activeEmployees)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/auth/users/:id - Update Employee details
router.put('/users/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, email, password, department, status, role } = req.body;

    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // If reactivating or changing role to employee, verify 50 max capacity
    if (existing.role === 'employee' && existing.status !== 'active' && status === 'active') {
      const activeCount = getActiveEmployeesCount(db);
      if (activeCount >= MAX_EMPLOYEES) {
        return res.status(400).json({
          success: false,
          message: `Cannot activate employee. Maximum limit of ${MAX_EMPLOYEES} active employees reached.`
        });
      }
    }

    // If changing email, check uniqueness
    if (email && email.trim().toLowerCase() !== existing.email.toLowerCase()) {
      const dup = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?').get(email.trim(), id);
      if (dup) {
        return res.status(400).json({ success: false, message: 'Email is already in use by another account.' });
      }
    }

    db.prepare(`
      UPDATE users
      SET name = ?,
          email = ?,
          password = ?,
          department = ?,
          status = ?,
          role = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name ? name.trim() : existing.name,
      email ? email.trim() : existing.email,
      (password && password.trim()) ? password.trim() : existing.password,
      department !== undefined ? department.trim() : existing.department,
      status || existing.status,
      role || existing.role,
      id
    );

    const updated = db.prepare('SELECT id, name, email, role, department, status, created_at, updated_at FROM users WHERE id = ?').get(id);
    const activeEmployees = getActiveEmployeesCount(db);

    res.json({
      success: true,
      message: 'User details updated successfully!',
      user: updated,
      maxEmployees: MAX_EMPLOYEES,
      activeEmployees,
      remainingSlots: Math.max(0, MAX_EMPLOYEES - activeEmployees)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/auth/users/:id - Delete an Employee
router.delete('/users/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    if (parseInt(id, 10) === 1) {
      return res.status(400).json({ success: false, message: 'Primary Administrator account cannot be deleted.' });
    }

    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    // Delete associated personal SMTP accounts and reassign or delete templates/students
    db.prepare('DELETE FROM smtp_accounts WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM templates WHERE user_id = ?').run(id);
    // Keep students or set user_id to 1 (Admin)
    db.prepare('UPDATE students SET user_id = 1 WHERE user_id = ?').run(id);
    db.prepare('UPDATE campaigns SET user_id = 1 WHERE user_id = ?').run(id);

    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    const activeEmployees = getActiveEmployeesCount(db);

    res.json({
      success: true,
      message: `Employee "${existing.name}" removed successfully. Slot freed up (${activeEmployees}/${MAX_EMPLOYEES}).`,
      maxEmployees: MAX_EMPLOYEES,
      activeEmployees,
      remainingSlots: Math.max(0, MAX_EMPLOYEES - activeEmployees)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.MAX_EMPLOYEES = MAX_EMPLOYEES;
router.getActiveEmployeesCount = getActiveEmployeesCount;

module.exports = router;

