require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const { getPersistentMongoDb } = require('../database/mongo');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'mailblast.db');

const SEED_EMAILS = [
  'rahul.sharma@iitb.ac.in',
  'pooja.patel@vjti.ac.in',
  'aditya.k@coep.ac.in',
  'ananya.d@mitwpu.edu.in',
  'rohan.shinde@vpkbiet.org',
  'sneha.jadhav@vpkbiet.org',
  'vikram.joshi@pict.edu',
  'priya.iyer@bits-pilani.ac.in',
  'siddharth.nair@iitd.ac.in',
  'neha.verma@dtu.ac.in',
  'kunal.shah@spit.ac.in',
  'tanvi.g@coep.ac.in',
  'manish.k@vit.ac.in',
  'swati.rane@vpkbiet.org',
  'arjun.rao@rvce.edu.in',
  'divya.menon@pes.edu',
  'gaurav.p@pccoepune.org',
  'meera.c@iiitb.ac.in',
  'akash.sawant@vpkbiet.org',
  'aishwarya.p@vjti.ac.in',
  'varun.reddy@iitm.ac.in',
  'shruti.kadam@mitwpu.edu.in',
  'abhishek.p@srmist.edu.in',
  'kavita.h@bmsce.ac.in',
  'nikhil.more@vpkbiet.org',
  'ritika.g@thapar.edu',
  'karthik.r@nitt.edu',
  'pallavi.b@coep.ac.in',
  'sameer.k@amity.edu',
  'pranali.m@vpkbiet.org',
  'tushar.a@vit.ac.in',
  'rashmi.d@pict.edu',
  'yash.singh@manipal.edu',
  'deepika.s@msrit.edu',
  'omkar.g@vpkbiet.org',
  'simran.w@dtu.ac.in',
  'tejas.s@vjti.ac.in',
  'bhavna.m@nitk.edu.in',
  'chaitanya.j@coep.ac.in',
  'payal.jagtap@vpkbiet.org'
];

const SEED_TEMPLATE_NAMES = [
  'Campus Placement Drive 2026 - Software Engineer',
  'Off-Campus Coding Assessment & Aptitude Round',
  'Summer AI & Cloud Internship Program 2025/2026',
  'Technical Interview Shortlist Notification',
  'National Coding Challenge & Hackathon Announcement',
  'Official Job Offer & Onboarding Instructions'
];

async function removeStaticData() {
  console.log('🧹 Purging static / mock data from database...');

  // 1. Clean SQLite
  const db = new Database(DB_PATH);

  // Remove mock students
  const placeholders = SEED_EMAILS.map(() => '?').join(',');
  const studentDeleteResult = db.prepare(`DELETE FROM students WHERE email IN (${placeholders})`).run(...SEED_EMAILS);
  console.log(`✅ SQLite: Deleted ${studentDeleteResult.changes} mock/seed students.`);

  // Remove test students created by test suite runs
  const testStudentDel = db.prepare(`DELETE FROM students WHERE import_source IN ('Bulk 500 Test File.xlsx', 'IIT_Bombay_Placement_Drive.xlsx')`).run();
  console.log(`✅ SQLite: Deleted ${testStudentDel.changes} test suite student records.`);

  // Remove mock/test campaigns & their recipients
  const testCampaigns = db.prepare(`
    SELECT id, title FROM campaigns 
    WHERE title IN (
      'Aparaitech Early Career Outreach - Maharashtra & Karnataka Tier-1 Colleges',
      'Automated Test Blast',
      'Retry Test Campaign'
    )
  `).all();

  if (testCampaigns.length > 0) {
    const campIds = testCampaigns.map(c => c.id);
    const campPlaceholders = campIds.map(() => '?').join(',');
    const recipDeleteResult = db.prepare(`DELETE FROM campaign_recipients WHERE campaign_id IN (${campPlaceholders})`).run(...campIds);
    const campDeleteResult = db.prepare(`DELETE FROM campaigns WHERE id IN (${campPlaceholders})`).run(...campIds);
    console.log(`✅ SQLite: Deleted ${campDeleteResult.changes} mock/test campaigns and ${recipDeleteResult.changes} associated recipients.`);
  } else {
    console.log('ℹ️ SQLite: No mock/test campaigns found.');
  }

  // Remove mock templates
  const tplPlaceholders = SEED_TEMPLATE_NAMES.map(() => '?').join(',');
  const tplDeleteResult = db.prepare(`DELETE FROM templates WHERE name IN (${tplPlaceholders})`).run(...SEED_TEMPLATE_NAMES);
  console.log(`✅ SQLite: Deleted ${tplDeleteResult.changes} demo templates.`);

  // 2. Clean MongoDB Atlas
  try {
    const mongo = await getPersistentMongoDb();

    // Remove mock templates from Mongo
    const mTemplateDelete = await mongo.collection('templates').deleteMany({
      name: { $in: SEED_TEMPLATE_NAMES }
    });
    console.log(`🍃 MongoDB: Deleted ${mTemplateDelete.deletedCount} demo templates.`);

    // Remove any test campaigns from Mongo
    const mCampDelete = await mongo.collection('campaigns').deleteMany({
      title: { $in: ['Automated Test Blast', 'Retry Test Campaign', 'Aparaitech Early Career Outreach - Maharashtra & Karnataka Tier-1 Colleges'] }
    });
    console.log(`🍃 MongoDB: Deleted ${mCampDelete.deletedCount} mock/test campaigns.`);

    // Remove any recipient records with test campaign titles or mock emails
    const mRecipDelete = await mongo.collection('campaign_recipients').deleteMany({
      recipient_email: { $in: SEED_EMAILS }
    });
    console.log(`🍃 MongoDB: Deleted ${mRecipDelete.deletedCount} mock recipient records.`);

    const mStudentDelete = await mongo.collection('students').deleteMany({
      email: { $in: SEED_EMAILS }
    });
    console.log(`🍃 MongoDB: Deleted ${mStudentDelete.deletedCount} mock students.`);
  } catch (mongoErr) {
    console.warn('MongoDB cleanup warning:', mongoErr.message);
  }

  console.log('✨ Static mock data purge complete!');
  process.exit(0);
}

removeStaticData().catch(err => {
  console.error('Purge error:', err);
  process.exit(1);
});
