const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const xlsx = require('xlsx');

// GET /api/students - List students with search, filters, and pagination
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const {
      search = '',
      college = '',
      batch = '',
      branch = '',
      status = '',
      import_batch_id = '',
      page = 1,
      limit = 20,
      sortBy = 'id',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const validLimit = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const userId = req.user ? req.user.id : 1;
    const isAdmin = req.isAdmin;

    let whereClauses = [];
    let params = [];

    // Multi-tenant isolation: Employees only see their own students, Admin can view all or filter by employee
    if (!isAdmin) {
      whereClauses.push('s.user_id = ?');
      params.push(userId);
    } else if (req.query.employee_id || req.query.user_id) {
      whereClauses.push('s.user_id = ?');
      params.push(parseInt(req.query.employee_id || req.query.user_id, 10));
    }

    if (search.trim()) {
      whereClauses.push('(s.name LIKE ? OR s.email LIKE ? OR s.college LIKE ? OR s.phone LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    if (college.trim()) {
      whereClauses.push('s.college = ?');
      params.push(college.trim());
    }

    if (batch.trim()) {
      whereClauses.push('s.batch = ?');
      params.push(batch.trim());
    }

    if (branch.trim()) {
      whereClauses.push('s.branch = ?');
      params.push(branch.trim());
    }

    if (status.trim()) {
      whereClauses.push('s.status = ?');
      params.push(status.trim());
    }

    if (import_batch_id.trim()) {
      whereClauses.push('s.import_batch_id = ?');
      params.push(import_batch_id.trim());
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count total matching
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM students s ${whereSql}`).get(...params);
    const total = countRow ? countRow.total : 0;

    // Allowed sort columns
    const allowedSorts = ['id', 'name', 'email', 'college', 'branch', 'batch', 'status', 'created_at'];
    const safeSort = allowedSorts.includes(sortBy) ? `s.${sortBy}` : 's.id';
    const safeOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Fetch paginated rows with employee attribution
    const rows = db.prepare(`
      SELECT s.*, u.name as employee_name, u.email as employee_email
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      ${whereSql}
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT ? OFFSET ?
    `).all(...params, validLimit, offset);

    // Get filter options isolated by user
    const filterUserSql = !isAdmin ? 'WHERE user_id = ?' : '';
    const filterUserParam = !isAdmin ? [userId] : [];

    const colleges = db.prepare(`
      SELECT college, COUNT(*) as count 
      FROM students 
      ${filterUserSql}
      GROUP BY college 
      ORDER BY count DESC
    `).all(...filterUserParam);

    const batches = db.prepare(`
      SELECT DISTINCT batch 
      FROM students 
      WHERE batch IS NOT NULL AND batch != '' ${!isAdmin ? 'AND user_id = ?' : ''}
      ORDER BY batch DESC
    `).all(...filterUserParam).map(b => b.batch);

    const branches = db.prepare(`
      SELECT DISTINCT branch 
      FROM students 
      WHERE branch IS NOT NULL AND branch != '' ${!isAdmin ? 'AND user_id = ?' : ''}
      ORDER BY branch ASC
    `).all(...filterUserParam).map(b => b.branch);

    const uploadBatches = db.prepare(`
      SELECT 
        import_batch_id,
        COALESCE(import_source, 'Uploaded Spreadsheet') as import_source,
        COUNT(*) as student_count,
        MIN(created_at) as created_at
      FROM students 
      WHERE import_batch_id IS NOT NULL AND import_batch_id != '' ${!isAdmin ? 'AND user_id = ?' : ''}
      GROUP BY import_batch_id
      ORDER BY created_at DESC
    `).all(...filterUserParam);

    res.json({
      success: true,
      students: rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: validLimit,
        totalPages: Math.ceil(total / validLimit) || 1
      },
      filterOptions: {
        colleges,
        batches,
        branches,
        uploadBatches
      }
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/students/batches - Get all distinct bulk upload batches with counts
router.get('/batches', (req, res) => {
  try {
    const db = getDb();
    const batches = db.prepare(`
      SELECT 
        import_batch_id, 
        COALESCE(import_source, 'Uploaded Spreadsheet') as import_source,
        COUNT(*) as student_count,
        MIN(created_at) as created_at
      FROM students 
      WHERE import_batch_id IS NOT NULL AND import_batch_id != ''
      GROUP BY import_batch_id
      ORDER BY created_at DESC
    `).all();
    res.json({ success: true, batches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/students/batches - Upload batch summary isolated by user
router.get('/batches', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user ? req.user.id : 1;
    const isAdmin = req.isAdmin;

    const batches = db.prepare(`
      SELECT 
        import_batch_id,
        COALESCE(import_source, 'Uploaded Spreadsheet') as import_source,
        COUNT(*) as student_count,
        MIN(created_at) as created_at
      FROM students 
      WHERE import_batch_id IS NOT NULL AND import_batch_id != '' ${!isAdmin ? 'AND user_id = ?' : ''}
      GROUP BY import_batch_id
      ORDER BY created_at DESC
    `).all(...(!isAdmin ? [userId] : []));
    res.json({ success: true, batches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/students/batch/:batchId - Delete all data of a single bulk upload
router.delete('/batch/:batchId', (req, res) => {
  try {
    const db = getDb();
    const { batchId } = req.params;
    const userId = req.user ? req.user.id : 1;
    const isAdmin = req.isAdmin;

    const deleteSql = !isAdmin
      ? 'DELETE FROM students WHERE import_batch_id = ? AND user_id = ?'
      : 'DELETE FROM students WHERE import_batch_id = ?';
    const params = !isAdmin ? [batchId, userId] : [batchId];

    const result = db.prepare(deleteSql).run(...params);

    res.json({
      success: true,
      deletedCount: result.changes,
      message: `Successfully deleted all ${result.changes} candidates from this bulk upload.`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/students/colleges - Unique colleges list with student counts
router.get('/colleges', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user ? req.user.id : 1;
    const isAdmin = req.isAdmin;

    const colleges = db.prepare(`
      SELECT college, COUNT(*) as student_count 
      FROM students 
      ${!isAdmin ? 'WHERE user_id = ?' : ''}
      GROUP BY college 
      ORDER BY student_count DESC
    `).all(...(!isAdmin ? [userId] : []));
    res.json({ success: true, colleges });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/students/export - Export students to CSV/Excel (Supports only Name & Email or Full Profile)
router.get('/export', (req, res) => {
  try {
    const db = getDb();
    const { format = 'csv', college, batch, search, fields = 'name_email', ids = '' } = req.query;
    const userId = req.user ? req.user.id : 1;
    const isAdmin = req.isAdmin;

    let whereClauses = [];
    let params = [];

    if (!isAdmin) {
      whereClauses.push('user_id = ?');
      params.push(userId);
    }

    if (ids && ids.trim()) {
      const idList = ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      if (idList.length > 0) {
        const placeholders = idList.map(() => '?').join(',');
        whereClauses.push(`id IN (${placeholders})`);
        params.push(...idList);
      }
    }

    if (search) {
      whereClauses.push('(name LIKE ? OR email LIKE ? OR college LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    if (college) {
      whereClauses.push('college = ?');
      params.push(college);
    }
    if (batch) {
      whereClauses.push('batch = ?');
      params.push(batch);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const students = db.prepare(`SELECT id, name, email, college, phone, branch, batch, status, created_at FROM students ${whereSql}`).all(...params);

    let exportRows;
    if (fields === 'name_email') {
      // Export only Name and Email
      exportRows = students.map(s => ({
        'Name': s.name,
        'Email': s.email
      }));
    } else {
      // Full Profile Export
      exportRows = students.map(s => ({
        'Student Name': s.name,
        'Email Address': s.email,
        'College / University': s.college,
        'Phone Number': s.phone || '',
        'Branch / Degree': s.branch,
        'Graduation Year': s.batch,
        'Status': s.status,
        'Registered Date': s.created_at
      }));
    }

    const worksheet = xlsx.utils.json_to_sheet(exportRows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Students');

    const filePrefix = fields === 'name_email' ? 'aparaitech_students_name_email' : 'aparaitech_students_full';

    if (format === 'xlsx') {
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filePrefix}.xlsx"`);
      return res.send(buffer);
    } else {
      const csv = xlsx.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filePrefix}.csv"`);
      return res.send(csv);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/students/:id - Get single student
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    res.json({ success: true, student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/students - Add single student
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user ? req.user.id : 1;
    const { name, email, college, phone, branch, batch, tags, notes } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and Email are required fields.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM students WHERE email = ? AND user_id = ?').get(cleanEmail, userId);
    if (existing) {
      return res.status(409).json({ success: false, message: `A student with email "${cleanEmail}" already exists in your candidate pool.` });
    }

    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (tags || '[]');

    const stmt = db.prepare(`
      INSERT INTO students (user_id, name, email, college, phone, branch, batch, tags, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId,
      name.trim(),
      cleanEmail,
      (college || 'General Pool').trim(),
      (phone || '').trim(),
      (branch || 'Computer Science').trim(),
      (batch || '2026').trim(),
      tagsJson,
      (notes || '').trim()
    );

    const newStudent = db.prepare('SELECT * FROM students WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, student: newStudent, message: 'Student added successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/students/:id - Update student
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const userId = req.user ? req.user.id : 1;
    const isAdmin = req.isAdmin;
    const { name, email, college, phone, branch, batch, status, tags, notes } = req.body;

    const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (!isAdmin && existing.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to edit this candidate.' });
    }

    const cleanEmail = email ? email.trim().toLowerCase() : existing.email;

    if (cleanEmail !== existing.email) {
      const emailTaken = db.prepare('SELECT id FROM students WHERE email = ? AND user_id = ? AND id != ?').get(cleanEmail, existing.user_id, id);
      if (emailTaken) {
        return res.status(409).json({ success: false, message: `Email "${cleanEmail}" is already used by another candidate in your pool.` });
      }
    }

    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (tags || existing.tags);

    db.prepare(`
      UPDATE students 
      SET name = ?, email = ?, college = ?, phone = ?, branch = ?, batch = ?, status = ?, tags = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name ? name.trim() : existing.name,
      cleanEmail,
      college ? college.trim() : existing.college,
      phone !== undefined ? phone.trim() : existing.phone,
      branch ? branch.trim() : existing.branch,
      batch ? batch.trim() : existing.batch,
      status || existing.status,
      tagsJson,
      notes !== undefined ? notes.trim() : existing.notes,
      id
    );

    const updated = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
    res.json({ success: true, student: updated, message: 'Student updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/students/:id - Delete single student
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const userId = req.user ? req.user.id : 1;
    const isAdmin = req.isAdmin;

    const deleteSql = !isAdmin
      ? 'DELETE FROM students WHERE id = ? AND user_id = ?'
      : 'DELETE FROM students WHERE id = ?';
    const params = !isAdmin ? [id, userId] : [id];

    const result = db.prepare(deleteSql).run(...params);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Student not found or unauthorized' });
    }

    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/students/bulk-delete - Bulk delete students
router.post('/bulk-delete', (req, res) => {
  try {
    const db = getDb();
    const { ids } = req.body;
    const userId = req.user ? req.user.id : 1;
    const isAdmin = req.isAdmin;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'An array of student IDs is required.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const deleteSql = !isAdmin
      ? `DELETE FROM students WHERE id IN (${placeholders}) AND user_id = ?`
      : `DELETE FROM students WHERE id IN (${placeholders})`;
    const params = !isAdmin ? [...ids, userId] : ids;

    const result = db.prepare(deleteSql).run(...params);

    res.json({
      success: true,
      deletedCount: result.changes,
      message: `Successfully deleted ${result.changes} students.`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
