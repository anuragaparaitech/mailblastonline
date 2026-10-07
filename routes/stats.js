const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

const { getPersistentMongoDb } = require('../database/mongo');

// GET /api/stats/dashboard - High-level metrics for dashboard
router.get('/dashboard', async (req, res) => {
  try {
    if (process.env.MONGODB_URI) {
      try {
        const mongo = await getPersistentMongoDb();
        const [studentCount, collegeAgg, batchGroups, campaignsMongo, deliveriesMongo] = await Promise.all([
          mongo.collection('students').countDocuments({ status: 'Active' }),
          mongo.collection('students').aggregate([
            { $match: { college: { $nin: [null, ''] } } },
            { $group: { _id: '$college', student_count: { $sum: 1 } } },
            { $project: { _id: 0, college: '$_id', student_count: 1 } },
            { $sort: { student_count: -1 } },
            { $limit: 8 }
          ]).toArray(),
          mongo.collection('students').aggregate([
            { $match: { batch: { $nin: [null, ''] } } },
            { $group: { _id: '$batch', count: { $sum: 1 } } },
            { $project: { _id: 0, batch: '$_id', count: 1 } },
            { $sort: { batch: -1 } }
          ]).toArray(),
          mongo.collection('campaigns').find({}).sort({ _id: -1 }).limit(5).toArray(),
          mongo.collection('campaign_recipients').find({ status: { $in: ['sent', 'failed'] } }).sort({ _id: -1 }).limit(8).toArray()
        ]);

        const distinctColleges = await mongo.collection('students').distinct('college', { college: { $nin: [null, ''] } });

        let totalSent = 0;
        let totalSuccess = 0;
        let totalFailed = 0;
        campaignsMongo.forEach(c => {
          totalSent += (c.sent_count || 0);
          totalSuccess += (c.success_count || 0);
          totalFailed += (c.failed_count || 0);
        });

        const overallSuccessRate = totalSent > 0
          ? Math.round((totalSuccess / totalSent) * 100)
          : 100;

        return res.json({
          success: true,
          stats: {
            totalStudents: studentCount,
            totalColleges: distinctColleges.length,
            totalCampaigns: campaignsMongo.length,
            totalEmailsSent: totalSent,
            totalSuccess: totalSuccess,
            totalFailed: totalFailed,
            successRate: overallSuccessRate,
            collegeDistribution: collegeAgg,
            batchBreakdown: batchGroups,
            recentCampaigns: campaignsMongo.map(c => ({ ...c, id: c.sqlite_id || String(c._id) })),
            recentDeliveries: deliveriesMongo.map(r => ({ ...r, id: r.sqlite_id || String(r._id) }))
          }
        });
      } catch (mongoErr) {
        console.warn('MongoDB stats fallback to SQLite:', mongoErr.message);
      }
    }

    const db = getDb();
    const userId = req.user ? req.user.id : 1;
    const isAdmin = req.isAdmin;

    const stdUserWhere = !isAdmin ? 'WHERE status = "Active" AND user_id = ?' : 'WHERE status = "Active"';
    const stdUserParam = !isAdmin ? [userId] : [];

    // 1. Total active students
    const studentCount = db.prepare(`SELECT COUNT(*) as count FROM students ${stdUserWhere}`).get(...stdUserParam).count;

    // 2. Total colleges
    const collegeCountSql = !isAdmin ? 'SELECT COUNT(DISTINCT college) as count FROM students WHERE user_id = ?' : 'SELECT COUNT(DISTINCT college) as count FROM students';
    const collegeCount = db.prepare(collegeCountSql).get(...stdUserParam).count;

    // 3. Campaign summary
    const campUserWhere = !isAdmin ? 'WHERE user_id = ?' : '';
    const campaignStats = db.prepare(`
      SELECT 
        COUNT(*) as total_campaigns,
        COALESCE(SUM(total_recipients), 0) as total_targeted,
        COALESCE(SUM(sent_count), 0) as total_sent,
        COALESCE(SUM(success_count), 0) as total_success,
        COALESCE(SUM(failed_count), 0) as total_failed
      FROM campaigns
      ${campUserWhere}
    `).get(...stdUserParam);

    const overallSuccessRate = campaignStats.total_sent > 0
      ? Math.round((campaignStats.total_success / campaignStats.total_sent) * 100)
      : 100;

    // 4. College distribution (Top 8)
    const collegeDistSql = !isAdmin
      ? 'SELECT college, COUNT(*) as student_count FROM students WHERE user_id = ? GROUP BY college ORDER BY student_count DESC LIMIT 8'
      : 'SELECT college, COUNT(*) as student_count FROM students GROUP BY college ORDER BY student_count DESC LIMIT 8';
    const collegeDistribution = db.prepare(collegeDistSql).all(...stdUserParam);

    // 5. Batch breakdown
    const batchSql = !isAdmin
      ? "SELECT batch, COUNT(*) as count FROM students WHERE batch IS NOT NULL AND batch != '' AND user_id = ? GROUP BY batch ORDER BY batch DESC"
      : "SELECT batch, COUNT(*) as count FROM students WHERE batch IS NOT NULL AND batch != '' GROUP BY batch ORDER BY batch DESC";
    const batchBreakdown = db.prepare(batchSql).all(...stdUserParam);

    // 6. Recent campaigns (Last 5)
    const recentCampSql = !isAdmin
      ? 'SELECT id, title, subject, total_recipients, sent_count, success_count, failed_count, status, started_at, completed_at, created_at FROM campaigns WHERE user_id = ? ORDER BY id DESC LIMIT 5'
      : 'SELECT c.id, c.title, c.subject, c.total_recipients, c.sent_count, c.success_count, c.failed_count, c.status, c.started_at, c.completed_at, c.created_at, u.name as employee_name FROM campaigns c LEFT JOIN users u ON c.user_id = u.id ORDER BY c.id DESC LIMIT 5';
    const recentCampaigns = db.prepare(recentCampSql).all(...stdUserParam);

    // 7. Recent delivery logs (Last 8)
    const recentDelivSql = !isAdmin
      ? "SELECT cr.*, c.title as campaign_title FROM campaign_recipients cr JOIN campaigns c ON cr.campaign_id = c.id WHERE c.user_id = ? AND cr.status IN ('sent', 'failed') ORDER BY cr.id DESC LIMIT 8"
      : "SELECT cr.*, c.title as campaign_title FROM campaign_recipients cr LEFT JOIN campaigns c ON cr.campaign_id = c.id WHERE cr.status IN ('sent', 'failed') ORDER BY cr.id DESC LIMIT 8";
    const recentDeliveries = db.prepare(recentDelivSql).all(...stdUserParam);

    // 8. Employee Overview (Admin only)
    let employeesOverview = null;
    let employeeCapacity = null;
    if (isAdmin) {
      const activeCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'employee' AND status = 'active'").get().count;
      employeeCapacity = {
        maxEmployees: 50,
        activeEmployees: activeCount,
        remainingSlots: Math.max(0, 50 - activeCount)
      };

      employeesOverview = db.prepare(`
        SELECT 
          u.id, u.name, u.email, u.department, u.status,
          (SELECT COUNT(*) FROM students s WHERE s.user_id = u.id) as student_count,
          (SELECT COUNT(*) FROM campaigns c WHERE c.user_id = u.id) as campaign_count,
          (SELECT COUNT(*) FROM smtp_accounts sa WHERE sa.user_id = u.id) as smtp_count
        FROM users u
        WHERE u.role = 'employee'
        ORDER BY u.id ASC
      `).all();
    }

    res.json({
      success: true,
      stats: {
        totalStudents: studentCount,
        totalColleges: collegeCount,
        totalCampaigns: campaignStats.total_campaigns,
        totalEmailsSent: campaignStats.total_sent,
        totalSuccess: campaignStats.total_success,
        totalFailed: campaignStats.total_failed,
        successRate: overallSuccessRate,
        collegeDistribution,
        batchBreakdown,
        recentCampaigns,
        recentDeliveries,
        employeesOverview,
        employeeCapacity
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
