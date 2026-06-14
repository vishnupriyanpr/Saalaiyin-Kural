/**
 * Saalai Kural seed script (PostgreSQL / knex).
 * Idempotent: truncates all tables in FK-safe order, then re-inserts the
 * canonical demo dataset. Re-runnable safely.
 *
 * Run: node seed.js   (or npm run seed)
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

// Deterministic-ish helpers ---------------------------------------------------
const ISO = (d) => new Date(d).toISOString();
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

(async () => {
  try {
    console.log('Seeding Saalai Kural database...');

    // 1) Wipe everything in FK-safe order. RESTART IDENTITY resets serials so
    //    captured ids are predictable; CASCADE covers any incidental refs.
    await db.raw(
      `TRUNCATE TABLE
        feedback,
        multiplier_events,
        projects,
        notifications,
        reward_redemptions,
        reward_items,
        complaints,
        roads,
        workers,
        users
      RESTART IDENTITY CASCADE`
    );

    const hash = (pw) => bcrypt.hashSync(pw, 10);

    // 2) USERS -----------------------------------------------------------------
    // Admin
    const [admin] = await db('users')
      .insert({
        role: 'admin',
        name: 'State Admin',
        email: 'admin@roadwatch.gov.in',
        phone: '9000000001',
        password: hash('RoadWatch@2026'),
        district: 'Tamil Nadu',
        city: 'Chennai',
        pincode: '600001',
      })
      .returning('id');

    // Authorities (one per road type)
    const authorityRows = [
      {
        role: 'authority',
        name: 'NHAI Tamil Nadu',
        email: 'authority.nh@roadwatch.gov.in',
        phone: '9000000010',
        password: hash('Authority@2026'),
        district: 'Tamil Nadu',
        department: 'National Highways Authority',
        jurisdiction_road_types: JSON.stringify(['NH']),
      },
      {
        role: 'authority',
        name: 'TN State Highways Dept',
        email: 'authority.sh@roadwatch.gov.in',
        phone: '9000000011',
        password: hash('Authority@2026'),
        district: 'Tamil Nadu',
        department: 'State Highways',
        jurisdiction_road_types: JSON.stringify(['SH']),
      },
      {
        role: 'authority',
        name: 'TN Rural Roads (MDR)',
        email: 'authority.mdr@roadwatch.gov.in',
        phone: '9000000012',
        password: hash('Authority@2026'),
        district: 'Tamil Nadu',
        department: 'Rural Development & Panchayat Raj',
        jurisdiction_road_types: JSON.stringify(['MDR']),
      },
    ];
    const authIds = await db('users').insert(authorityRows).returning('id');
    const authorityByType = {
      NH: authIds[0].id,
      SH: authIds[1].id,
      MDR: authIds[2].id,
    };

    // Civilians
    const civilianRows = [
      {
        role: 'civilian',
        name: 'Karthik Subramanian',
        phone: '9842100001',
        email: 'karthik.s@example.com',
        password: hash('Citizen@2026'),
        district: 'Coimbatore',
        city: 'Coimbatore',
        pincode: '641001',
        points: 2400,
        points_redeemed: 800,
        level: 'Road Guardian',
        streak_days: 14,
        last_report_date: daysAgo(1),
        badges: JSON.stringify(['first_report', 'streak_7', 'pothole_hunter']),
        aadhaar_hash: 'AADHAAR_HASH_DEMO_KARTHIK',
      },
      {
        role: 'civilian',
        name: 'Lakshmi Narayanan',
        phone: '9842100002',
        email: 'lakshmi.n@example.com',
        password: hash('Citizen@2026'),
        district: 'Chennai',
        city: 'Chennai',
        pincode: '600028',
        points: 1320,
        points_redeemed: 200,
        level: 'Civic Champion',
        streak_days: 6,
        last_report_date: daysAgo(2),
        badges: JSON.stringify(['first_report', 'streak_3']),
        aadhaar_hash: 'AADHAAR_HASH_DEMO_LAKSHMI',
      },
      {
        role: 'civilian',
        name: 'Selvam Kumar',
        phone: '9842100003',
        email: 'selvam.k@example.com',
        password: hash('Citizen@2026'),
        district: 'Madurai',
        city: 'Madurai',
        pincode: '625001',
        points: 760,
        points_redeemed: 0,
        level: 'Active Reporter',
        streak_days: 3,
        last_report_date: daysAgo(3),
        badges: JSON.stringify(['first_report']),
        aadhaar_hash: 'AADHAAR_HASH_DEMO_SELVAM',
      },
      {
        role: 'civilian',
        name: 'Priya Ramachandran',
        phone: '9842100004',
        email: 'priya.r@example.com',
        password: hash('Citizen@2026'),
        district: 'Coimbatore',
        city: 'Coimbatore',
        pincode: '641012',
        points: 480,
        points_redeemed: 150,
        level: 'Rookie Reporter',
        streak_days: 2,
        last_report_date: daysAgo(4),
        badges: JSON.stringify(['first_report']),
        aadhaar_hash: 'AADHAAR_HASH_DEMO_PRIYA',
      },
      {
        role: 'civilian',
        name: 'Arjun Vetrivel',
        phone: '9842100005',
        email: 'arjun.v@example.com',
        password: hash('Citizen@2026'),
        district: 'Chennai',
        city: 'Chennai',
        pincode: '600040',
        points: 120,
        points_redeemed: 0,
        level: 'Rookie Reporter',
        streak_days: 1,
        last_report_date: daysAgo(6),
        badges: JSON.stringify([]),
        aadhaar_hash: 'AADHAAR_HASH_DEMO_ARJUN',
      },
    ];
    const civIds = (await db('users').insert(civilianRows).returning('id')).map((r) => r.id);

    // 3) WORKERS ---------------------------------------------------------------
    const workerRows = [
      {
        name: 'Murugan Pandian',
        phone: '9876500001',
        skill_tags: JSON.stringify(['Pothole Repair', 'Crack Sealing']),
        district: 'Coimbatore',
        availability: 'available',
        rating: 4.7,
        is_civilian_worker: false,
      },
      {
        name: 'Ravi Shankar',
        phone: '9876500002',
        skill_tags: JSON.stringify(['Asphalt Laying', 'Drainage']),
        district: 'Chennai',
        availability: 'busy',
        rating: 4.5,
        is_civilian_worker: false,
      },
      {
        name: 'Anbarasan T',
        phone: '9876500003',
        skill_tags: JSON.stringify(['Signage', 'Road Marking']),
        district: 'Madurai',
        availability: 'available',
        rating: 4.2,
        is_civilian_worker: true,
      },
      {
        name: 'Devaraj M',
        phone: '9876500004',
        skill_tags: JSON.stringify(['Pothole Repair', 'Waterlogging Clearance']),
        district: 'Coimbatore',
        availability: 'available',
        rating: 4.9,
        is_civilian_worker: false,
      },
    ];
    const workerIds = (await db('workers').insert(workerRows).returning('id')).map((r) => r.id);

    // 4) ROADS -----------------------------------------------------------------
    const deptForType = {
      NH: 'National Highways Authority',
      SH: 'State Highways',
      MDR: 'Rural Development & Panchayat Raj',
    };
    const mh = (...items) => JSON.stringify(items);
    const roadDefs = [
      { name: 'NH44', type: 'NH', contractor_name: 'Larsen & Toubro Ltd', contractor_contact: '9445010001', budget_sanctioned: 25000000, budget_spent: 18000000, last_relayed_date: '2024-11-15' },
      { name: 'NH544 Salem-Coimbatore', type: 'NH', contractor_name: 'GMR Highways Ltd', contractor_contact: '9445010002', budget_sanctioned: 19000000, budget_spent: 12500000, last_relayed_date: '2025-01-20' },
      { name: 'NH183 Madurai-Theni', type: 'NH', contractor_name: 'IRB Infrastructure', contractor_contact: '9445010003', budget_sanctioned: 16000000, budget_spent: 9000000, last_relayed_date: '2024-09-10' },
      { name: 'SH15 Mettupalayam Road', type: 'SH', contractor_name: 'TN Roads Pvt Ltd', contractor_contact: '9445010004', budget_sanctioned: 8500000, budget_spent: 6200000, last_relayed_date: '2025-02-05' },
      { name: 'SH17A Pollachi Road', type: 'SH', contractor_name: 'Coimbatore Constructions', contractor_contact: '9445010005', budget_sanctioned: 7200000, budget_spent: 4100000, last_relayed_date: '2024-12-01' },
      { name: 'SH49 Madurai Ring Road', type: 'SH', contractor_name: 'Madurai Infra Co', contractor_contact: '9445010006', budget_sanctioned: 9800000, budget_spent: 8800000, last_relayed_date: '2025-03-12' },
      { name: 'MDR23 Avinashi Link Road', type: 'MDR', contractor_name: 'Kongu Civil Works', contractor_contact: '9445010007', budget_sanctioned: 3500000, budget_spent: 2100000, last_relayed_date: '2024-10-22' },
      { name: 'MDR41 Sulur-Sivanmalai Road', type: 'MDR', contractor_name: 'Velan Builders', contractor_contact: '9445010008', budget_sanctioned: 2800000, budget_spent: 1500000, last_relayed_date: '2025-01-08' },
      { name: 'MDR58 Thiruvanmiyur Service Road', type: 'MDR', contractor_name: 'Chennai Local Works', contractor_contact: '9445010009', budget_sanctioned: 2200000, budget_spent: 900000, last_relayed_date: '2024-08-30' },
      { name: 'MDR12 Othakadai Village Road', type: 'MDR', contractor_name: 'Pandya Constructions', contractor_contact: '9445010010', budget_sanctioned: 1800000, budget_spent: 1700000, last_relayed_date: '2025-02-28' },
    ];
    const roadRows = roadDefs.map((r) => ({
      ...r,
      jurisdiction_dept: deptForType[r.type],
      maintenance_history: mh(
        { date: '2024-06-15', action: 'Patch repair', cost: 120000 },
        { date: '2024-12-10', action: 'Resurfacing', cost: 450000 }
      ),
    }));
    const roads = await db('roads').insert(roadRows).returning(['id', 'type', 'name']);

    // 5) COMPLAINTS ------------------------------------------------------------
    // Coimbatore-centric coords with TN spread; always non-null.
    const coord = (i) => {
      const baseLat = 11.0 + ((i % 5) * 0.02) - 0.04; // 10.96..11.04
      const baseLng = 76.95 + ((i % 7) * 0.02);       // 76.95..77.07
      return { lat: +(baseLat).toFixed(6), lng: +(baseLng).toFixed(6) };
    };
    const districtFor = (rname) =>
      rname.includes('Chennai') || rname.includes('Thiruvanmiyur') ? 'Chennai'
      : rname.includes('Madurai') || rname.includes('Theni') || rname.includes('Othakadai') ? 'Madurai'
      : 'Coimbatore';

    const typeCycle = ['pothole', 'crack', 'waterlogging', 'signage', 'other'];
    const statusCycle = ['pending', 'in_progress', 'resolved', 'rejected'];

    const complaintRows = [];
    for (let i = 0; i < 25; i++) {
      const road = roads[i % roads.length];
      const cType = typeCycle[i % typeCycle.length];
      // distribute statuses: ~9 resolved, ~6 in_progress, ~7 pending, ~3 rejected
      let status;
      if (i % 4 === 2) status = 'resolved';
      else if (i % 4 === 1) status = 'in_progress';
      else if (i % 7 === 6) status = 'rejected';
      else status = 'pending';

      const civilian_id = civIds[i % civIds.length];
      const { lat, lng } = coord(i);
      const district = districtFor(road.name);
      const severityScore = 3 + (i % 8); // 3..10
      const severity = severityScore >= 8 ? 'high' : severityScore >= 5 ? 'medium' : 'low';
      const estimatedCost = 25000 + severityScore * 8000;
      const recommendedPoints = 50 + severityScore * 10;
      const createdAt = daysAgo(28 - i); // spread over ~4 weeks
      const isWorked = status === 'in_progress' || status === 'resolved';
      const isResolved = status === 'resolved';

      const title =
        cType === 'pothole' ? `Large pothole on ${road.name} stretch`
        : cType === 'crack' ? `Surface cracking on ${road.name}`
        : cType === 'waterlogging' ? `Waterlogging reported on ${road.name}`
        : cType === 'signage' ? `Missing/damaged signage on ${road.name}`
        : `Damaged shoulder on ${road.name}`;

      const description =
        `${title} in ${district} district. Reported by citizen, severity assessed as ${severity}. ` +
        `Requires inspection and ${cType === 'waterlogging' ? 'drainage clearance' : 'repair work'}.`;

      complaintRows.push({
        civilian_id,
        title,
        type: cType,
        description,
        photo_url: `/uploads/sample_complaint_${(i % 6) + 1}.jpg`,
        photo_metadata: JSON.stringify({ filename: `sample_complaint_${(i % 6) + 1}.jpg`, size_kb: 320 + i, captured_at: createdAt }),
        lat,
        lng,
        address: `Near KM ${10 + i} marker, ${road.name}, ${district}`,
        district,
        severity,
        ai_classification: JSON.stringify({
          type: cType,
          severity_score: severityScore,
          confidence: +(0.7 + (i % 3) * 0.08).toFixed(2),
          estimated_cost: estimatedCost,
          recommended_points: recommendedPoints,
        }),
        status,
        points_awarded: isResolved ? recommendedPoints : 0,
        worker_id: isWorked ? workerIds[i % workerIds.length] : null,
        budget_estimated: estimatedCost,
        budget_actual: isResolved ? estimatedCost + (i % 3) * 5000 - 2000 : null,
        road_id: road.id,
        road_type: road.type,
        assigned_authority_id: authorityByType[road.type],
        proof_image_url: isResolved ? `/uploads/proof_${(i % 4) + 1}.jpg` : null,
        resolution_notes: isResolved ? `Repair completed and inspected. ${cType} fixed by assigned crew.` : null,
        resolved_at: isResolved ? daysAgo(28 - i - 3) : null,
        created_at: createdAt,
        updated_at: isWorked ? daysAgo(28 - i - 2) : createdAt,
      });
    }
    const complaints = await db('complaints')
      .insert(complaintRows)
      .returning(['id', 'civilian_id', 'status']);

    const resolvedComplaints = complaints
      .map((c, idx) => ({ ...c, idx }))
      .filter((c) => c.status === 'resolved');

    // 6) REWARD ITEMS ----------------------------------------------------------
    await db('reward_items').insert([
      { name: 'Coffee Voucher', icon: 'coffee', points_cost: 200, category: 'food', stock: 50, active: true },
      { name: 'Movie Ticket', icon: 'film', points_cost: 500, category: 'entertainment', stock: 30, active: true },
      { name: 'Metro Travel Card', icon: 'train', points_cost: 800, category: 'travel', stock: 20, active: true },
      { name: 'Eco Tote Bag', icon: 'shopping-bag', points_cost: 350, category: 'merchandise', stock: 40, active: true },
      { name: 'Civic Hero T-Shirt', icon: 'shirt', points_cost: 1000, category: 'merchandise', stock: 15, active: true },
    ]);

    // 7) REWARD REDEMPTIONS ----------------------------------------------------
    await db('reward_redemptions').insert([
      { civilian_id: civIds[0], item_name: 'Metro Travel Card', points_cost: 800, status: 'fulfilled', redeemed_at: daysAgo(10) },
      { civilian_id: civIds[1], item_name: 'Coffee Voucher', points_cost: 200, status: 'pending', redeemed_at: daysAgo(3) },
      { civilian_id: civIds[3], item_name: 'Eco Tote Bag', points_cost: 350, status: 'fulfilled', redeemed_at: daysAgo(7) },
    ]);

    // 8) NOTIFICATIONS ---------------------------------------------------------
    await db('notifications').insert([
      { user_id: civIds[0], complaint_id: complaints[2].id, title: 'Complaint Resolved', message: 'Your reported pothole has been repaired. You earned points!', body: 'Your reported pothole has been repaired. You earned points!', type: 'success', read: false, created_at: daysAgo(2) },
      { user_id: civIds[1], complaint_id: complaints[1].id, title: 'Work In Progress', message: 'A crew has been assigned to your complaint.', body: 'A crew has been assigned to your complaint.', type: 'info', read: true, created_at: daysAgo(4) },
      { user_id: civIds[2], complaint_id: complaints[5].id, title: 'Complaint Received', message: 'We have received your report and it is under review.', body: 'We have received your report and it is under review.', type: 'info', read: false, created_at: daysAgo(5) },
      { user_id: civIds[0], title: 'Streak Milestone', message: 'You hit a 14-day reporting streak! Keep it up.', body: 'You hit a 14-day reporting streak! Keep it up.', type: 'achievement', read: false, created_at: daysAgo(1) },
      { target_role: 'authority', target_id: authorityByType.NH, title: 'New NH Complaints', message: '3 new National Highway complaints await assignment.', body: '3 new National Highway complaints await assignment.', type: 'alert', read: false, created_at: daysAgo(2) },
      { target_role: 'authority', target_id: authorityByType.SH, title: 'New SH Complaints', message: 'New State Highway complaints require your attention.', body: 'New State Highway complaints require your attention.', type: 'alert', read: true, created_at: daysAgo(3) },
      { target_role: 'admin', title: 'Weekly Summary', message: '25 complaints logged this period across Tamil Nadu.', body: '25 complaints logged this period across Tamil Nadu.', type: 'report', read: false, created_at: daysAgo(1) },
      { target_role: 'all', title: 'Monsoon Advisory', message: 'Report waterlogging promptly during monsoon for faster action.', body: 'Report waterlogging promptly during monsoon for faster action.', type: 'info', read: false, created_at: daysAgo(6) },
    ]);

    // 9) FEEDBACK (5 resolved complaints) -------------------------------------
    const feedbackRows = resolvedComplaints.slice(0, 5).map((c, k) => ({
      complaint_id: c.id,
      citizen_id: c.civilian_id,
      rating: 3 + (k % 3), // 3,4,5,3,4
      comment: [
        'Quick resolution, thank you!',
        'Road is much smoother now.',
        'Excellent work by the crew.',
        'Took a while but fixed well.',
        'Satisfied with the repair quality.',
      ][k],
      created_at: daysAgo(5 - k),
    }));
    if (feedbackRows.length) await db('feedback').insert(feedbackRows);

    // 10) PROJECTS -------------------------------------------------------------
    await db('projects').insert([
      {
        title: 'Coimbatore Pothole Drive Q2',
        complaint_ids: JSON.stringify(complaints.slice(0, 4).map((c) => c.id)),
        district: 'Coimbatore',
        budget_total: 1500000,
        budget_spent: 620000,
        status: 'in_progress',
        worker_ids: JSON.stringify([workerIds[0], workerIds[3]]),
        start_date: '2026-05-01',
        end_date: '2026-07-31',
        created_at: daysAgo(20),
      },
      {
        title: 'Chennai Service Road Restoration',
        complaint_ids: JSON.stringify(complaints.slice(4, 7).map((c) => c.id)),
        district: 'Chennai',
        budget_total: 2200000,
        budget_spent: 0,
        status: 'planning',
        worker_ids: JSON.stringify([workerIds[1]]),
        start_date: '2026-07-01',
        end_date: '2026-09-30',
        created_at: daysAgo(8),
      },
      {
        title: 'Madurai Ring Road Maintenance',
        complaint_ids: JSON.stringify(complaints.slice(7, 10).map((c) => c.id)),
        district: 'Madurai',
        budget_total: 1800000,
        budget_spent: 1800000,
        status: 'completed',
        worker_ids: JSON.stringify([workerIds[2]]),
        start_date: '2026-03-01',
        end_date: '2026-05-15',
        created_at: daysAgo(40),
      },
    ]);

    // 11) MULTIPLIER EVENTS ----------------------------------------------------
    await db('multiplier_events').insert([
      { district: 'Coimbatore', multiplier: 2.0, start_date: '2026-06-01', end_date: '2026-06-30', created_at: daysAgo(14) },
      { district: 'Chennai', multiplier: 1.5, start_date: '2026-06-10', end_date: '2026-07-10', created_at: daysAgo(5) },
    ]);

    // Summary -----------------------------------------------------------------
    const counts = {};
    for (const t of [
      'users', 'workers', 'roads', 'complaints', 'reward_items',
      'reward_redemptions', 'notifications', 'projects', 'feedback', 'multiplier_events',
    ]) {
      const [{ c }] = await db(t).count('* as c');
      counts[t] = Number(c);
    }
    console.log('Seed complete. Row counts:');
    console.table(counts);
    console.log('Login credentials:');
    console.log('  admin     : admin@roadwatch.gov.in / RoadWatch@2026');
    console.log('  authority : authority.nh@roadwatch.gov.in (and .sh / .mdr) / Authority@2026');
    console.log('  civilian  : karthik.s@example.com (phone 9842100001) / Citizen@2026');

    await db.destroy();
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    try { await db.destroy(); } catch (_) {}
    process.exit(1);
  }
})();
