const db = require('../config/db');
const bcrypt = require('bcryptjs');

// -----------------------------------------------------------------------------
// CATEGORIES CRUD
// -----------------------------------------------------------------------------
exports.getCategories = async (req, res) => {
  try {
    const catsRes = await db.query(
      `SELECT c.*, COUNT(e.id) AS events_count
       FROM categories c
       LEFT JOIN events e ON c.id = e.category_id
       GROUP BY c.id
       ORDER BY c.sort_order ASC, c.id ASC`
    );
    res.render('admin/categories', {
      title: 'Quản Lý Danh Mục',
      categories: catsRes.rows,
      error: req.query.error || null,
      success: req.query.success || null,
      user: req.session.user
    });
  } catch (err) {
    res.status(500).render('error', { title: 'Lỗi', message: err.message, user: req.session.user });
  }
};

exports.postCreateCategory = async (req, res) => {
  const { name, sort_order } = req.body;
  try {
    if (!name || !name.trim()) {
      return res.redirect('/admin/categories?error=' + encodeURIComponent('Tên danh mục không được để trống.'));
    }
    await db.query(
      `INSERT INTO categories (name, sort_order) VALUES ($1, $2)`,
      [name.trim(), parseInt(sort_order, 10) || 0]
    );
    res.redirect('/admin/categories?success=' + encodeURIComponent('Thêm danh mục thành công.'));
  } catch (err) {
    res.redirect('/admin/categories?error=' + encodeURIComponent('Lỗi thêm danh mục (có thể bị trùng tên).'));
  }
};

exports.postDeleteCategory = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const checkRes = await db.query('SELECT COUNT(*) FROM events WHERE category_id = $1', [id]);
    if (parseInt(checkRes.rows[0].count, 10) > 0) {
      return res.redirect('/admin/categories?error=' + encodeURIComponent('Không thể xóa danh mục đang có phim hoặc sự kiện liên kết.'));
    }
    await db.query('DELETE FROM categories WHERE id = $1', [id]);
    res.redirect('/admin/categories?success=' + encodeURIComponent('Xóa danh mục thành công.'));
  } catch (err) {
    res.redirect('/admin/categories?error=' + encodeURIComponent('Lỗi khi xóa danh mục.'));
  }
};

// -----------------------------------------------------------------------------
// VENUES CRUD
// -----------------------------------------------------------------------------
exports.getVenues = async (req, res) => {
  try {
    const venuesRes = await db.query(
      `SELECT v.*, COUNT(s.id) AS showtimes_count
       FROM venues v
       LEFT JOIN showtimes s ON v.id = s.venue_id
       GROUP BY v.id
       ORDER BY v.id ASC`
    );
    res.render('admin/venues', {
      title: 'Quản Lý Phòng Chiếu & Địa Điểm',
      venues: venuesRes.rows,
      error: req.query.error || null,
      success: req.query.success || null,
      user: req.session.user
    });
  } catch (err) {
    res.status(500).render('error', { title: 'Lỗi', message: err.message, user: req.session.user });
  }
};

exports.postCreateVenue = async (req, res) => {
  const { name, address, rows_count, seats_per_row, vip_rows } = req.body;
  try {
    const rows = parseInt(rows_count, 10);
    const seats = parseInt(seats_per_row, 10);
    const vip = parseInt(vip_rows, 10) || 0;

    if (!name || !address || rows <= 0 || seats <= 0 || vip < 0 || vip > rows) {
      return res.redirect('/admin/venues?error=' + encodeURIComponent('Thông tin phòng chiếu không hợp lệ (số hàng > 0, số ghế > 0, số hàng VIP <= số hàng).'));
    }

    const capacity = rows * seats;
    await db.query(
      `INSERT INTO venues (name, address, rows_count, seats_per_row, vip_rows, capacity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name.trim(), address.trim(), rows, seats, vip, capacity]
    );

    res.redirect('/admin/venues?success=' + encodeURIComponent('Tạo phòng chiếu thành công.'));
  } catch (err) {
    res.redirect('/admin/venues?error=' + encodeURIComponent('Lỗi tạo phòng (có thể bị trùng tên phòng).'));
  }
};

exports.postDeleteVenue = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const checkRes = await db.query(
      `SELECT COUNT(*) FROM showtimes WHERE venue_id = $1 AND starts_at > NOW()`,
      [id]
    );
    if (parseInt(checkRes.rows[0].count, 10) > 0) {
      return res.redirect('/admin/venues?error=' + encodeURIComponent('Không thể xóa phòng chiếu đang có các suất chiếu trong tương lai.'));
    }
    await db.query('DELETE FROM venues WHERE id = $1', [id]);
    res.redirect('/admin/venues?success=' + encodeURIComponent('Xóa phòng chiếu thành công.'));
  } catch (err) {
    res.redirect('/admin/venues?error=' + encodeURIComponent('Không thể xóa phòng chiếu này (đã có lịch sử suất chiếu liên kết).'));
  }
};

// -----------------------------------------------------------------------------
// EVENTS CRUD & POSTER UPLOAD
// -----------------------------------------------------------------------------
exports.getEvents = async (req, res) => {
  try {
    const [eventsRes, catsRes] = await Promise.all([
      db.query(
        `SELECT e.*, c.name AS category_name, u.full_name AS creator_name,
                COUNT(s.id) AS showtimes_count
         FROM events e
         JOIN categories c ON e.category_id = c.id
         JOIN users u ON e.created_by = u.id
         GROUP BY e.id, c.name, u.full_name
         ORDER BY e.id DESC`
      ),
      db.query('SELECT * FROM categories ORDER BY sort_order ASC, id ASC')
    ]);

    res.render('admin/events', {
      title: 'Quản Lý Phim & Sự Kiện',
      events: eventsRes.rows,
      categories: catsRes.rows,
      error: req.query.error || null,
      success: req.query.success || null,
      user: req.session.user
    });
  } catch (err) {
    res.status(500).render('error', { title: 'Lỗi', message: err.message, user: req.session.user });
  }
};

exports.postCreateEvent = async (req, res) => {
  const { category_id, type, title, description, duration_minutes, age_rating, language, status } = req.body;
  try {
    if (!title || !duration_minutes || !category_id) {
      return res.redirect('/admin/events?error=' + encodeURIComponent('Vui lòng điền đầy đủ các trường bắt buộc.'));
    }

    let posterPath = '/images/posters/poster_01.svg';
    if (req.file) {
      posterPath = '/uploads/' + req.file.filename;
    }

    await db.query(
      `INSERT INTO events (category_id, type, title, description, poster_path, duration_minutes, age_rating, language, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        parseInt(category_id, 10),
        type || 'movie',
        title.trim(),
        description || '',
        posterPath,
        parseInt(duration_minutes, 10),
        age_rating || 'P',
        language || 'Tiếng Việt',
        status || 'draft',
        req.session.user.id
      ]
    );

    res.redirect('/admin/events?success=' + encodeURIComponent('Thêm phim/sự kiện thành công.'));
  } catch (err) {
    console.error('[CREATE EVENT ERROR]', err);
    res.redirect('/admin/events?error=' + encodeURIComponent('Lỗi khi thêm sự kiện: ' + err.message));
  }
};

exports.postUpdateEventStatus = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { new_status } = req.body;

  if (!['draft', 'published', 'cancelled', 'completed'].includes(new_status)) {
    return res.redirect('/admin/events?error=' + encodeURIComponent('Trạng thái không hợp lệ.'));
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('UPDATE events SET status = $1 WHERE id = $2', [new_status, id]);

    // If cancelled: cancel all future showtimes and their active bookings
    if (new_status === 'cancelled') {
      const futureStRes = await client.query(
        `SELECT id FROM showtimes WHERE event_id = $1 AND starts_at > NOW() AND status = 'scheduled'`,
        [id]
      );

      for (const st of futureStRes.rows) {
        await client.query(`UPDATE showtimes SET status = 'cancelled' WHERE id = $1`, [st.id]);
        await client.query(
          `UPDATE bookings SET status = 'cancelled' WHERE showtime_id = $1 AND status IN ('pending', 'confirmed')`,
          [st.id]
        );
        await client.query(
          `UPDATE booking_seats SET is_active = false WHERE showtime_id = $1`,
          [st.id]
        );
      }
    }

    await client.query('COMMIT');
    res.redirect('/admin/events?success=' + encodeURIComponent(`Đã chuyển trạng thái sự kiện sang "${new_status}".`));
  } catch (err) {
    await client.query('ROLLBACK');
    res.redirect('/admin/events?error=' + encodeURIComponent('Lỗi cập nhật trạng thái sự kiện.'));
  } finally {
    client.release();
  }
};

// -----------------------------------------------------------------------------
// SHOWTIMES CRUD
// -----------------------------------------------------------------------------
exports.getShowtimes = async (req, res) => {
  try {
    const [stRes, eventsRes, venuesRes] = await Promise.all([
      db.query(
        `SELECT s.*, e.title AS event_title, e.duration_minutes, v.name AS venue_name,
                (SELECT COUNT(*) FROM booking_seats bs WHERE bs.showtime_id = s.id AND bs.is_active = true) AS booked_count
         FROM showtimes s
         JOIN events e ON s.event_id = e.id
         JOIN venues v ON s.venue_id = v.id
         ORDER BY s.starts_at DESC LIMIT 50`
      ),
      db.query(`SELECT id, title, duration_minutes FROM events WHERE status != 'cancelled' ORDER BY title ASC`),
      db.query(`SELECT id, name, capacity FROM venues ORDER BY name ASC`)
    ]);

    res.render('admin/showtimes', {
      title: 'Quản Lý Suất Chiếu',
      showtimes: stRes.rows,
      events: eventsRes.rows,
      venues: venuesRes.rows,
      error: req.query.error || null,
      success: req.query.success || null,
      user: req.session.user
    });
  } catch (err) {
    res.status(500).render('error', { title: 'Lỗi', message: err.message, user: req.session.user });
  }
};

exports.postCreateShowtime = async (req, res) => {
  const { event_id, venue_id, starts_at, price_standard, price_vip } = req.body;
  try {
    const eventRes = await db.query('SELECT duration_minutes, title FROM events WHERE id = $1', [event_id]);
    if (eventRes.rows.length === 0) {
      return res.redirect('/admin/showtimes?error=' + encodeURIComponent('Phim/Sự kiện không tồn tại.'));
    }

    const duration = eventRes.rows[0].duration_minutes;
    const startTime = new Date(starts_at);
    if (isNaN(startTime.getTime())) {
      return res.redirect('/admin/showtimes?error=' + encodeURIComponent('Thời gian bắt đầu không hợp lệ.'));
    }

    // Automatically compute ends_at = starts_at + duration
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    const priceStd = parseFloat(price_standard);
    const priceVipVal = parseFloat(price_vip);
    if (isNaN(priceStd) || priceStd < 0 || isNaN(priceVipVal) || priceVipVal < 0) {
      return res.redirect('/admin/showtimes?error=' + encodeURIComponent('Giá vé phải >= 0.'));
    }

    // Check overlapping in same venue with 15-minute cleaning buffer
    // existing.starts_at - 15m < new.ends_at AND existing.ends_at + 15m > new.starts_at
    const overlapRes = await db.query(
      `SELECT s.id, e.title, s.starts_at, s.ends_at
       FROM showtimes s
       JOIN events e ON s.event_id = e.id
       WHERE s.venue_id = $1 
         AND s.status = 'scheduled'
         AND (s.starts_at - INTERVAL '15 minutes') < $3
         AND (s.ends_at + INTERVAL '15 minutes') > $2`,
      [venue_id, startTime, endTime]
    );

    if (overlapRes.rows.length > 0) {
      const conflict = overlapRes.rows[0];
      return res.redirect('/admin/showtimes?error=' + encodeURIComponent(`Xung đột giờ: Phòng này đã có suất chiếu "${conflict.title}" từ ${new Date(conflict.starts_at).toLocaleTimeString('vi-VN')} đến ${new Date(conflict.ends_at).toLocaleTimeString('vi-VN')} (bao gồm 15 phút dọn phòng).`));
    }

    await db.query(
      `INSERT INTO showtimes (event_id, venue_id, starts_at, ends_at, price_standard, price_vip, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')`,
      [event_id, venue_id, startTime, endTime, priceStd, priceVipVal]
    );

    res.redirect('/admin/showtimes?success=' + encodeURIComponent('Tạo suất chiếu thành công!'));
  } catch (err) {
    console.error('[CREATE SHOWTIME ERROR]', err);
    res.redirect('/admin/showtimes?error=' + encodeURIComponent('Lỗi tạo suất chiếu: ' + err.message));
  }
};

exports.postCancelShowtime = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`UPDATE showtimes SET status = 'cancelled' WHERE id = $1`, [id]);
    await client.query(
      `UPDATE bookings SET status = 'cancelled' WHERE showtime_id = $1 AND status IN ('pending', 'confirmed')`,
      [id]
    );
    await client.query(`UPDATE booking_seats SET is_active = false WHERE showtime_id = $1`, [id]);

    await client.query('COMMIT');
    res.redirect('/admin/showtimes?success=' + encodeURIComponent('Hủy suất chiếu và đã tự động hủy các vé liên quan!'));
  } catch (err) {
    await client.query('ROLLBACK');
    res.redirect('/admin/showtimes?error=' + encodeURIComponent('Lỗi khi hủy suất chiếu.'));
  } finally {
    client.release();
  }
};

// -----------------------------------------------------------------------------
// STAFF ACCOUNTS MANAGEMENT
// -----------------------------------------------------------------------------
exports.getStaffList = async (req, res) => {
  try {
    const staffRes = await db.query(
      `SELECT id, username, email, full_name, role, is_active, created_at
       FROM users
       WHERE role IN ('staff', 'admin')
       ORDER BY role ASC, id ASC`
    );

    res.render('admin/staff', {
      title: 'Quản Lý Tài Khoản Nhân Viên',
      staffList: staffRes.rows,
      error: req.query.error || null,
      success: req.query.success || null,
      user: req.session.user
    });
  } catch (err) {
    res.status(500).render('error', { title: 'Lỗi', message: err.message, user: req.session.user });
  }
};

exports.postCreateStaff = async (req, res) => {
  const { username, email, password, full_name, role } = req.body;
  try {
    if (!username || !email || !password || !full_name) {
      return res.redirect('/admin/staff?error=' + encodeURIComponent('Vui lòng điền đầy đủ các trường.'));
    }

    const checkRes = await db.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (checkRes.rows.length > 0) {
      return res.redirect('/admin/staff?error=' + encodeURIComponent('Tên đăng nhập hoặc email đã tồn tại.'));
    }

    const hash = await bcrypt.hash(password, 10);
    const assignedRole = role === 'admin' ? 'admin' : 'staff';

    await db.query(
      `INSERT INTO users (username, email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [username.trim(), email.trim(), hash, full_name.trim(), assignedRole]
    );

    res.redirect('/admin/staff?success=' + encodeURIComponent(`Đã tạo tài khoản ${assignedRole} "${username}" thành công.`));
  } catch (err) {
    res.redirect('/admin/staff?error=' + encodeURIComponent('Lỗi khi tạo nhân viên: ' + err.message));
  }
};

exports.postToggleStaffActive = async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const currentUserId = req.session.user.id;

  // Cannot lock oneself
  if (targetId === currentUserId) {
    return res.redirect('/admin/staff?error=' + encodeURIComponent('Bạn không được phép tự khóa tài khoản của chính mình!'));
  }

  try {
    await db.query(
      `UPDATE users SET is_active = NOT is_active WHERE id = $1`,
      [targetId]
    );
    res.redirect('/admin/staff?success=' + encodeURIComponent('Cập nhật trạng thái tài khoản thành công.'));
  } catch (err) {
    res.redirect('/admin/staff?error=' + encodeURIComponent('Lỗi cập nhật tài khoản.'));
  }
};
