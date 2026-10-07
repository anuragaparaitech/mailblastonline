const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { getPersistentMongoDb } = require('../database/mongo');

const MAX_EMPLOYEES = 50;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Helper to get currently active employees count across MongoDB Atlas / SQLite
 */
async function getActiveEmployeesCountAsync() {
  try {
    const mongoDb = await getPersistentMongoDb();
    if (mongoDb) {
      return await mongoDb.collection('users').countDocuments({ role: 'employee', status: 'active' });
    }
  } catch (e) {}

  try {
    const db = getDb();
    const row = db.prepare("SELECT count(*) as count FROM users WHERE role = 'employee' AND status = 'active'").get();
    return row ? row.count : 0;
  } catch (e) {
    return 0;
  }
}

function getActiveEmployeesCount(db) {
  try {
    const row = db.prepare("SELECT count(*) as count FROM users WHERE role = 'employee' AND status = 'active'").get();
    return row ? row.count : 0;
  } catch (e) {
    return 0;
  }
}

// POST /api/auth/login - Authenticate Admin or Employee
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    let user = null;

    // 1. Look up in MongoDB Atlas first (Persistent across serverless / Vercel restarts)
    try {
      const mongoDb = await getPersistentMongoDb();
      if (mongoDb) {
        const doc = await mongoDb.collection('users').findOne({
          email: { $regex: new RegExp('^' + escapeRegex(cleanEmail) + '$', 'i') }
        });
        if (doc) {
          const { _id, ...rest } = doc;
          user = { id: doc.id || String(_id), ...rest };
        }
      }
    } catch (mongoErr) {
      console.warn('MongoDB Atlas login check note:', mongoErr.message);
    }

    // 2. Fallback to local SQLite if not found in MongoDB
    if (!user) {
      try {
        const db = getDb();
        user = db.prepare('SELECT id, name, email, password, role, department, status, created_at FROM users WHERE LOWER(email) = LOWER(?)').get(cleanEmail);
      } catch (sqlErr) {
        console.warn('SQLite login check note:', sqlErr.message);
      }
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Your account is deactivated. Please contact the administrator.' });
    }

    if (String(user.password).trim() !== cleanPassword) {
      return res.status(401).json({ success: false, message: 'Invalid password. Please check your credentials.' });
    }

    // Ensure user is also present in local SQLite cache
    try {
      const db = getDb();
      const existingInSqlite = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(cleanEmail);
      if (!existingInSqlite) {
        db.prepare('INSERT OR IGNORE INTO users (id, name, email, password, role, department, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(user.id, user.name, user.email, user.password, user.role, user.department, user.status);
      }
    } catch (e) {}

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
router.get('/me', async (req, res) => {
  try {
    const rawUserId = req.headers['x-user-id'] || req.query.user_id || 1;
    let user = null;

    // Check MongoDB Atlas
    try {
      const mongoDb = await getPersistentMongoDb();
      if (mongoDb) {
        const numId = Number(rawUserId);
        const query = isNaN(numId)
          ? { $or: [{ id: rawUserId }, { email: String(rawUserId).toLowerCase() }] }
          : { $or: [{ id: numId }, { id: String(numId) }, { email: String(rawUserId).toLowerCase() }] };
        const doc = await mongoDb.collection('users').findOne(query);
        if (doc) {
          const { _id, password, ...rest } = doc;
          user = { id: doc.id || String(_id), ...rest };
        }
      }
    } catch (e) {}

    // Fallback to SQLite
    if (!user) {
      try {
        const db = getDb();
        const row = db.prepare('SELECT id, name, email, role, department, status FROM users WHERE id = ?').get(rawUserId);
        if (row) user = row;
      } catch (e) {}
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User session not found.' });
    }

    const activeEmployees = await getActiveEmployeesCountAsync();
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
router.get('/users', async (req, res) => {
  try {
    let usersList = [];
    let isFromMongo = false;

    try {
      const mongoDb = await getPersistentMongoDb();
      if (mongoDb) {
        const mongoUsers = await mongoDb.collection('users').find({}).toArray();
        if (mongoUsers.length > 0) {
          isFromMongo = true;
          usersList = await Promise.all(mongoUsers.map(async u => {
            const { _id, password, ...rest } = u;
            const uid = u.id || String(_id);
            const numUid = Number(uid);

            const userFilter = isNaN(numUid)
              ? { user_id: uid }
              : { $or: [{ user_id: uid }, { user_id: numUid }, { user_id: String(numUid) }] };

            const [studentCount, smtpCount, campCount] = await Promise.all([
              mongoDb.collection('students').countDocuments(userFilter),
              mongoDb.collection('smtp_accounts').countDocuments(userFilter),
              mongoDb.collection('campaigns').countDocuments(userFilter)
            ]);

            return {
              id: uid,
              ...rest,
              student_count: studentCount,
              smtp_count: smtpCount,
              campaign_count: campCount
            };
          }));
        }
      }
    } catch (e) {
      console.warn('MongoDB fetch users note:', e.message);
    }

    if (!isFromMongo) {
      const db = getDb();
      usersList = db.prepare(`
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
    }

    // Sort: admin first, then by id ascending
    usersList.sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (a.role !== 'admin' && b.role === 'admin') return 1;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    const activeEmployees = usersList.filter(u => u.role === 'employee' && u.status === 'active').length;

    res.json({
      success: true,
      users: usersList,
      maxEmployees: MAX_EMPLOYEES,
      activeEmployees,
      remainingSlots: Math.max(0, MAX_EMPLOYEES - activeEmployees)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/users - Admin adds new Employee (strictly max 50 employees)
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, department = 'Campus Recruitment', role = 'employee' } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Full name, email address, and password are required.' });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password).trim();
    const cleanDept = (department && String(department).trim()) ? String(department).trim() : 'Campus Recruitment';
    const cleanRole = role === 'admin' ? 'admin' : 'employee';

    if (!cleanName) return res.status(400).json({ success: false, message: 'Employee full name cannot be blank.' });
    if (!cleanEmail || !cleanEmail.includes('@')) return res.status(400).json({ success: false, message: 'A valid email address is required.' });
    if (!cleanPassword) return res.status(400).json({ success: false, message: 'Password cannot be blank.' });

    let mongoDb = null;
    try {
      mongoDb = await getPersistentMongoDb();
    } catch (e) {}

    // 1. Enforce 50 employees maximum limit
    let activeCount = 0;
    if (mongoDb) {
      activeCount = await mongoDb.collection('users').countDocuments({ role: 'employee', status: 'active' });
    } else {
      activeCount = getActiveEmployeesCount(getDb());
    }

    if (cleanRole === 'employee' && activeCount >= MAX_EMPLOYEES) {
      return res.status(400).json({
        success: false,
        message: `Maximum capacity reached: System is limited to exactly ${MAX_EMPLOYEES} employees. Please deactivate or remove an existing employee before adding a new one.`
      });
    }

    // 2. Check email uniqueness across MongoDB Atlas and SQLite
    let emailExists = false;
    if (mongoDb) {
      const dupMongo = await mongoDb.collection('users').findOne({
        email: { $regex: new RegExp('^' + escapeRegex(cleanEmail) + '$', 'i') }
      });
      if (dupMongo) emailExists = true;
    }
    if (!emailExists) {
      try {
        const db = getDb();
        const dupSql = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(cleanEmail);
        if (dupSql) emailExists = true;
      } catch (e) {}
    }

    if (emailExists) {
      return res.status(400).json({ success: false, message: `An account with email "${cleanEmail}" already exists. Please choose a different email.` });
    }

    let newUserId = null;

    // 3. Save into SQLite first if available
    try {
      const db = getDb();
      const insertResult = db.prepare(`
        INSERT INTO users (name, email, password, role, department, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `).run(cleanName, cleanEmail, cleanPassword, cleanRole, cleanDept);

      newUserId = insertResult.lastInsertRowid;

      // Provide default initial SMTP configuration placeholder in SQLite
      db.prepare(`
        INSERT INTO smtp_accounts (user_id, name, host, port, secure, user, pass, from_name, from_email, reply_to, daily_limit, sent_today, is_active, priority)
        VALUES (?, ?, 'smtp.gmail.com', 587, 0, ?, '', ?, ?, 'careers@aparaitech.org', 500, 0, 1, 1)
      `).run(
        newUserId,
        `${cleanName} Sender`,
        cleanEmail,
        `${cleanName} | Aparaitech Recruitment`,
        cleanEmail
      );
    } catch (sqlErr) {
      console.warn('SQLite insert note:', sqlErr.message);
    }

    // 4. Save into MongoDB Atlas (Persistent!)
    if (mongoDb) {
      if (!newUserId) {
        // Calculate next numeric ID
        const maxUser = await mongoDb.collection('users').find({ id: { $exists: true } }).sort({ id: -1 }).limit(1).toArray();
        const maxId = (maxUser.length > 0 && typeof maxUser[0].id === 'number') ? maxUser[0].id : 5;
        newUserId = maxId + 1;
      }

      const now = new Date().toISOString();
      const userDoc = {
        id: newUserId,
        name: cleanName,
        email: cleanEmail,
        password: cleanPassword,
        role: cleanRole,
        department: cleanDept,
        status: 'active',
        created_at: now,
        updated_at: now
      };

      await mongoDb.collection('users').updateOne(
        { email: cleanEmail },
        { $set: userDoc },
        { upsert: true }
      );

      // Create initial SMTP account in MongoDB Atlas
      await mongoDb.collection('smtp_accounts').updateOne(
        { user: cleanEmail, user_id: newUserId },
        {
          $setOnInsert: {
            user_id: newUserId,
            name: `${cleanName} Sender`,
            host: 'smtp.gmail.com',
            port: 587,
            secure: 0,
            user: cleanEmail,
            pass: '',
            from_name: `${cleanName} | Aparaitech Recruitment`,
            from_email: cleanEmail,
            reply_to: 'careers@aparaitech.org',
            daily_limit: 500,
            sent_today: 0,
            is_active: 1,
            priority: 1
          }
        },
        { upsert: true }
      );
    }

    const createdUser = {
      id: newUserId,
      name: cleanName,
      email: cleanEmail,
      role: cleanRole,
      department: cleanDept,
      status: 'active'
    };

    const finalActiveEmployees = await getActiveEmployeesCountAsync();

    res.status(201).json({
      success: true,
      message: `Employee "${cleanName}" added successfully! (${finalActiveEmployees}/${MAX_EMPLOYEES} slots used)`,
      user: createdUser,
      maxEmployees: MAX_EMPLOYEES,
      activeEmployees: finalActiveEmployees,
      remainingSlots: Math.max(0, MAX_EMPLOYEES - finalActiveEmployees)
    });
  } catch (error) {
    console.error('Error adding user/employee:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to add employee.' });
  }
});

// PUT /api/auth/users/:id - Update Employee details
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, department, status, role } = req.body || {};

    let mongoDb = null;
    try {
      mongoDb = await getPersistentMongoDb();
    } catch (e) {}

    let existing = null;
    if (mongoDb) {
      const numId = Number(id);
      const query = isNaN(numId) ? { id } : { $or: [{ id: numId }, { id: String(numId) }] };
      existing = await mongoDb.collection('users').findOne(query);
    }
    if (!existing) {
      try {
        existing = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
      } catch (e) {}
    }

    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const cleanName = name !== undefined ? String(name).trim() : existing.name;
    const cleanEmail = email !== undefined ? String(email).trim().toLowerCase() : existing.email;
    const cleanDept = department !== undefined ? String(department).trim() : existing.department;
    const cleanStatus = status !== undefined ? String(status).trim() : existing.status;
    const cleanRole = role !== undefined ? String(role).trim() : existing.role;
    const cleanPassword = (password !== undefined && String(password).trim().length > 0) ? String(password).trim() : existing.password;

    // If reactivating or changing role to employee, verify 50 max capacity
    if (existing.role === 'employee' && existing.status !== 'active' && cleanStatus === 'active') {
      const activeCount = await getActiveEmployeesCountAsync();
      if (activeCount >= MAX_EMPLOYEES) {
        return res.status(400).json({
          success: false,
          message: `Cannot activate employee. Maximum limit of ${MAX_EMPLOYEES} active employees reached.`
        });
      }
    }

    // If changing email, check uniqueness
    if (cleanEmail && cleanEmail !== existing.email.toLowerCase()) {
      if (mongoDb) {
        const dup = await mongoDb.collection('users').findOne({
          email: { $regex: new RegExp('^' + escapeRegex(cleanEmail) + '$', 'i') },
          id: { $ne: existing.id }
        });
        if (dup) {
          return res.status(400).json({ success: false, message: `Email "${cleanEmail}" is already in use by another account.` });
        }
      }
    }

    const now = new Date().toISOString();

    // Update in MongoDB Atlas
    if (mongoDb) {
      await mongoDb.collection('users').updateOne(
        { email: existing.email.toLowerCase() },
        {
          $set: {
            name: cleanName,
            email: cleanEmail,
            password: cleanPassword,
            department: cleanDept,
            status: cleanStatus,
            role: cleanRole,
            updated_at: now
          }
        }
      );
    }

    // Update in SQLite
    try {
      const db = getDb();
      db.prepare(`
        UPDATE users
        SET name = ?, email = ?, password = ?, department = ?, status = ?, role = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(cleanName, cleanEmail, cleanPassword, cleanDept, cleanStatus, cleanRole, id);
    } catch (e) {}

    const updatedUser = {
      id: existing.id,
      name: cleanName,
      email: cleanEmail,
      role: cleanRole,
      department: cleanDept,
      status: cleanStatus,
      updated_at: now
    };

    const activeEmployees = await getActiveEmployeesCountAsync();

    res.json({
      success: true,
      message: 'User details updated successfully!',
      user: updatedUser,
      maxEmployees: MAX_EMPLOYEES,
      activeEmployees,
      remainingSlots: Math.max(0, MAX_EMPLOYEES - activeEmployees)
    });
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update employee.' });
  }
});

// DELETE /api/auth/users/:id - Delete an Employee
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (parseInt(id, 10) === 1 || String(id) === '1') {
      return res.status(400).json({ success: false, message: 'Primary Administrator account cannot be deleted.' });
    }

    let mongoDb = null;
    try {
      mongoDb = await getPersistentMongoDb();
    } catch (e) {}

    let existing = null;
    if (mongoDb) {
      const numId = Number(id);
      const query = isNaN(numId) ? { id } : { $or: [{ id: numId }, { id: String(numId) }] };
      existing = await mongoDb.collection('users').findOne(query);
    }
    if (!existing) {
      try {
        existing = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
      } catch (e) {}
    }

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    // Delete in MongoDB Atlas
    if (mongoDb) {
      const numId = Number(id);
      const userFilter = isNaN(numId)
        ? { user_id: id }
        : { $or: [{ user_id: id }, { user_id: numId }, { user_id: String(numId) }] };

      await mongoDb.collection('smtp_accounts').deleteMany(userFilter);
      await mongoDb.collection('templates').deleteMany(userFilter);
      await mongoDb.collection('students').updateMany(userFilter, { $set: { user_id: 1 } });
      await mongoDb.collection('campaigns').updateMany(userFilter, { $set: { user_id: 1 } });
      await mongoDb.collection('users').deleteOne({
        $or: [{ id: existing.id }, { email: existing.email.toLowerCase() }]
      });
    }

    // Delete in SQLite
    try {
      const db = getDb();
      const deleteTx = db.transaction(() => {
        db.prepare('DELETE FROM smtp_accounts WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM templates WHERE user_id = ?').run(id);
        db.prepare('UPDATE students SET user_id = 1 WHERE user_id = ?').run(id);
        db.prepare('UPDATE campaigns SET user_id = 1 WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
      });
      deleteTx();
    } catch (e) {}

    const activeEmployees = await getActiveEmployeesCountAsync();

    res.json({
      success: true,
      message: `Employee "${existing.name}" removed successfully. Slot freed up (${activeEmployees}/${MAX_EMPLOYEES}).`,
      maxEmployees: MAX_EMPLOYEES,
      activeEmployees,
      remainingSlots: Math.max(0, MAX_EMPLOYEES - activeEmployees)
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to delete employee.' });
  }
});

router.MAX_EMPLOYEES = MAX_EMPLOYEES;
router.getActiveEmployeesCount = getActiveEmployeesCount;
router.getActiveEmployeesCountAsync = getActiveEmployeesCountAsync;

module.exports = router;
