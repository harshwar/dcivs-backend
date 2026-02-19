const supabase = require('../db');

/**
 * GET /api/admin/analytics
 * Returns aggregated stats for the admin dashboard.
 * - Total Students, Certs, Active Wallets, Revocations
 * - Issuance Trend (Last 6 months)
 * - Department Distribution (Top 5)
 * - Status Ratios (Valid vs Revoked)
 * - Student Funnel (Registered -> Wallet -> Cert)
 * - Average Time to Issue (Registration -> Cert Issue)
 */
async function getAnalytics(req, res) {
  try {
    // Parallelize queries for performance
    const [
      studentsRes,
      certsRes,
      walletsRes,
      revokedRes
    ] = await Promise.all([
      supabase.from('students').select('id, created_at, course_name', { count: 'exact' }),
      supabase.from('certificates').select('id, issue_date, department, status, recipient_id'),
      supabase.from('wallets').select('id', { count: 'exact' }),
      supabase.from('certificates').select('id', { count: 'exact' }).eq('status', false)
    ]);

    if (studentsRes.error) throw studentsRes.error;
    if (certsRes.error) throw certsRes.error;

    const students = studentsRes.data;
    const certs = certsRes.data;

    // --- 1. Key Stats ---
    const stats = {
      total_students: studentsRes.count,
      total_certificates: certsRes.count,
      active_wallets: walletsRes.count,
      revoked_certificates: revokedRes.count
    };

    // --- 2. Issuance Trend (Last 6 Months) ---
    const months = {};
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short', year: 'numeric' });
      months[key] = 0;
    }

    certs.forEach(c => {
      const d = new Date(c.issue_date);
      const key = d.toLocaleString('default', { month: 'short', year: 'numeric' });
      if (months.hasOwnProperty(key)) {
        months[key]++;
      }
    });

    const issuance_trend = Object.keys(months).map(key => ({
      date: key,
      count: months[key]
    }));

    // --- 3. Department Distribution ---
    const deptCounts = {};
    certs.forEach(c => {
      const dept = c.department || 'Unassigned';
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    });

    const department_distribution = Object.entries(deptCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5

    // --- 4. Status Distribution ---
    const status_distribution = {
      Valid: certs.filter(c => c.status).length,
      Revoked: certs.filter(c => !c.status).length
    };

    // --- 5. Student Funnel ---
    // Registered (All students) -> Wallet (Wallets count) -> Cert (Unique recipient_ids in certificates)
    const uniqueRecipients = new Set(certs.map(c => c.recipient_id)).size;
    
    const student_funnel = {
      registered: stats.total_students,
      wallet_created: stats.active_wallets,
      cert_received: uniqueRecipients
    };

    // --- 6. Average Time to Issue ---
    // Time from Student Creation -> First Certificate Issue
    // We need to match student creation time with their first cert time
    let totalTimeMs = 0;
    let countTime = 0;
    
    // Map student ID -> created_at
    const studentCreationTimes = {};
    students.forEach(s => {
      studentCreationTimes[s.id] = new Date(s.created_at).getTime();
    });

    // Find first cert for each recipient
    const firstCertTimes = {};
    certs.forEach(c => {
      if (!c.recipient_id) return;
      const issueTime = new Date(c.issue_date).getTime();
      if (!firstCertTimes[c.recipient_id] || issueTime < firstCertTimes[c.recipient_id]) {
        firstCertTimes[c.recipient_id] = issueTime;
      }
    });

    // Calculate diffs
    for (const [studentId, certTime] of Object.entries(firstCertTimes)) {
      const regTime = studentCreationTimes[studentId];
      if (regTime && certTime > regTime) {
        totalTimeMs += (certTime - regTime);
        countTime++;
      }
    }

    const avgTimeDays = countTime > 0 ? Math.round(totalTimeMs / (1000 * 60 * 60 * 24)) : 0;

    res.json({
      stats: {
        ...stats,
        avg_time_to_issue_days: avgTimeDays
      },
      charts: {
        issuance_trend,
        department_distribution,
        status_distribution,
        student_funnel
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics.' });
  }
}

module.exports = { getAnalytics };
