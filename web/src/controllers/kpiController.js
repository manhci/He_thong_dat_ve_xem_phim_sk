const db = require('../config/db');

exports.getDashboard = async (req, res) => {
  try {
    // 1. KPI Today Cards
    const kpiRes = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN b.paid_at >= CURRENT_DATE AND b.status IN ('confirmed', 'checked_in') THEN b.total_amount ELSE 0 END), 0) AS revenue_today,
        COUNT(CASE WHEN b.created_at >= CURRENT_DATE THEN 1 END) AS bookings_today,
        (SELECT COUNT(*) FROM showtimes WHERE starts_at > NOW() AND status = 'scheduled') AS upcoming_showtimes
      FROM bookings b
    `);

    // 2. Average Occupancy Rate
    const occupancyRes = await db.query(`
      SELECT 
        COALESCE(SUM(v.capacity), 0) AS total_capacity,
        COALESCE((
          SELECT COUNT(*) 
          FROM booking_seats bs 
          JOIN showtimes s ON bs.showtime_id = s.id 
          WHERE bs.is_active = true AND s.starts_at >= CURRENT_DATE - INTERVAL '30 days'
        ), 0) AS total_booked_seats
      FROM showtimes s
      JOIN venues v ON s.venue_id = v.id
      WHERE s.starts_at >= CURRENT_DATE - INTERVAL '30 days'
    `);

    const totalCap = parseInt(occupancyRes.rows[0].total_capacity, 10) || 1;
    const totalBooked = parseInt(occupancyRes.rows[0].total_booked_seats, 10) || 0;
    const occupancyRate = ((totalBooked / totalCap) * 100).toFixed(1);

    // 3. Top Movies & Events by Tickets Sold
    const topEventsRes = await db.query(`
      SELECT e.id, e.title, e.type, e.poster_path,
             COUNT(bs.id) AS tickets_sold,
             COALESCE(SUM(bs.price), 0) AS total_revenue
      FROM events e
      JOIN showtimes s ON e.id = s.event_id
      JOIN booking_seats bs ON s.id = bs.showtime_id AND bs.is_active = true
      GROUP BY e.id, e.title, e.type, e.poster_path
      ORDER BY tickets_sold DESC, total_revenue DESC
      LIMIT 6
    `);

    // 4. Check-in Rate per Showtime
    const checkinRateRes = await db.query(`
      SELECT s.id, e.title AS event_title, s.starts_at, v.name AS venue_name,
             COUNT(b.id) AS total_confirmed,
             COUNT(CASE WHEN b.status = 'checked_in' THEN 1 END) AS checked_in_count,
             ROUND(
               (COUNT(CASE WHEN b.status = 'checked_in' THEN 1 END)::numeric / NULLIF(COUNT(b.id), 0)) * 100, 1
             ) AS checkin_percentage
      FROM showtimes s
      JOIN events e ON s.event_id = e.id
      JOIN venues v ON s.venue_id = v.id
      LEFT JOIN bookings b ON s.id = b.showtime_id AND b.status IN ('confirmed', 'checked_in')
      GROUP BY s.id, e.title, s.starts_at, v.name
      HAVING COUNT(b.id) > 0
      ORDER BY s.starts_at DESC
      LIMIT 8
    `);

    // 5. Daily Revenue (last 7 days)
    const dailyRevenueRes = await db.query(`
      SELECT TO_CHAR(d.day, 'YYYY-MM-DD') AS date_str,
             TO_CHAR(d.day, 'DD/MM') AS display_date,
             COALESCE(SUM(b.total_amount), 0) AS daily_revenue
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d(day)
      LEFT JOIN bookings b ON DATE(b.paid_at) = d.day AND b.status IN ('confirmed', 'checked_in')
      GROUP BY d.day
      ORDER BY d.day ASC
    `);

    // Find max daily revenue for simple CSS bar chart scaling
    let maxDaily = 1;
    dailyRevenueRes.rows.forEach(r => {
      const val = parseFloat(r.daily_revenue);
      if (val > maxDaily) maxDaily = val;
    });

    res.render('admin/dashboard', {
      title: 'Báo Cáo KPI & Quản Trị Hệ Thống',
      kpi: kpiRes.rows[0],
      occupancyRate,
      topEvents: topEventsRes.rows,
      checkinStats: checkinRateRes.rows,
      dailyRevenue: dailyRevenueRes.rows,
      maxDaily,
      user: req.session.user
    });
  } catch (err) {
    console.error('[KPI DASHBOARD ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Lỗi tải KPI dashboard.', user: req.session.user });
  }
};
