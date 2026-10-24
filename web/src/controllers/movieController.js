const db = require('../config/db');

// GET / - Public catalog
exports.getHome = async (req, res) => {
  try {
    const { type, category_id, search, sort } = req.query;

    let queryText = `
      SELECT e.*, c.name AS category_name,
             MIN(s.price_standard) AS min_price,
             COUNT(s.id) AS showtimes_count
      FROM events e
      JOIN categories c ON e.category_id = c.id
      LEFT JOIN showtimes s ON e.id = s.event_id AND s.status = 'scheduled' AND s.starts_at > NOW()
      WHERE e.status = 'published'
    `;
    const params = [];
    let paramIndex = 1;

    if (type && ['movie', 'event'].includes(type)) {
      queryText += ` AND e.type = $${paramIndex++}`;
      params.push(type);
    }

    if (category_id) {
      queryText += ` AND e.category_id = $${paramIndex++}`;
      params.push(parseInt(category_id, 10));
    }

    if (search && search.trim()) {
      queryText += ` AND e.title ILIKE $${paramIndex++}`;
      params.push(`%${search.trim()}%`);
    }

    queryText += ` GROUP BY e.id, c.name`;

    if (sort === 'price_asc') {
      queryText += ` ORDER BY min_price ASC NULLS LAST, e.id DESC`;
    } else if (sort === 'price_desc') {
      queryText += ` ORDER BY min_price DESC NULLS LAST, e.id DESC`;
    } else if (sort === 'title_asc') {
      queryText += ` ORDER BY e.title ASC`;
    } else {
      queryText += ` ORDER BY e.id DESC`;
    }

    const [eventsRes, catsRes] = await Promise.all([
      db.query(queryText, params),
      db.query('SELECT * FROM categories ORDER BY sort_order ASC, id ASC')
    ]);

    res.render('index', {
      title: 'Hệ Thống Đặt Vé Xem Phim & Sự Kiện',
      events: eventsRes.rows,
      categories: catsRes.rows,
      filterType: type || 'all',
      filterCategory: category_id || '',
      searchQuery: search || '',
      currentSort: sort || 'newest',
      user: req.session.user
    });
  } catch (err) {
    console.error('[HOME ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải danh sách sự kiện.', user: req.session.user });
  }
};

// GET /events/:id - Event detail with showtimes grouped by date
exports.getEventDetail = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const eventRes = await db.query(
      `SELECT e.*, c.name AS category_name, u.full_name AS author_name 
       FROM events e 
       JOIN categories c ON e.category_id = c.id 
       JOIN users u ON e.created_by = u.id 
       WHERE e.id = $1`,
      [eventId]
    );

    if (eventRes.rows.length === 0) {
      return res.status(404).render('error', { title: '404', message: 'Không tìm thấy phim hoặc sự kiện yêu cầu.', user: req.session.user });
    }

    const event = eventRes.rows[0];

    // Non-staff can only see published events
    const isStaffOrAdmin = req.session.user && ['staff', 'admin'].includes(req.session.user.role);
    if (event.status !== 'published' && !isStaffOrAdmin) {
      return res.status(403).render('error', { title: '403', message: 'Nội dung này chưa được xuất bản.', user: req.session.user });
    }

    // Fetch showtimes with venue and booked seats count
    const showtimesRes = await db.query(
      `SELECT s.*, v.name AS venue_name, v.capacity,
              (SELECT COUNT(*) FROM booking_seats bs WHERE bs.showtime_id = s.id AND bs.is_active = true) AS booked_count
       FROM showtimes s
       JOIN venues v ON s.venue_id = v.id
       WHERE s.event_id = $1
       ORDER BY s.starts_at ASC`,
      [eventId]
    );

    // Group showtimes by Date string YYYY-MM-DD
    const groupedShowtimes = {};
    const now = new Date();

    showtimesRes.rows.forEach(st => {
      const stDate = new Date(st.starts_at);
      const dateKey = stDate.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });
      if (!groupedShowtimes[dateKey]) {
        groupedShowtimes[dateKey] = [];
      }
      st.is_ended = stDate < now;
      st.available_seats = Math.max(0, st.capacity - parseInt(st.booked_count, 10));
      groupedShowtimes[dateKey].push(st);
    });

    res.render('detail', {
      title: event.title,
      event,
      groupedShowtimes,
      user: req.session.user
    });
  } catch (err) {
    console.error('[EVENT DETAIL ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Lỗi tải chi tiết sự kiện.', user: req.session.user });
  }
};
