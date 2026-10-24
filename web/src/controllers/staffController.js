const db = require('../config/db');
const { cleanupOverdueBookings } = require('../services/cleaner');

// GET /staff - Staff dashboard: search bookings, list today showtimes
exports.getStaffDashboard = async (req, res) => {
  const query = req.query.q ? req.query.q.trim() : '';
  let searchResults = [];

  try {
    await cleanupOverdueBookings();

    if (query) {
      const searchRes = await db.query(
        `SELECT b.*, u.full_name AS customer_name, u.email AS customer_email,
                s.starts_at, s.ends_at, e.title AS event_title, v.name AS venue_name,
                STRING_AGG(bs.seat_label, ', ' ORDER BY bs.seat_label) AS seat_labels
         FROM bookings b
         JOIN users u ON b.user_id = u.id
         JOIN showtimes s ON b.showtime_id = s.id
         JOIN events e ON s.event_id = e.id
         JOIN venues v ON s.venue_id = v.id
         LEFT JOIN booking_seats bs ON b.id = bs.booking_id
         WHERE b.booking_code ILIKE $1 OR u.full_name ILIKE $1 OR u.username ILIKE $1
         GROUP BY b.id, u.full_name, u.email, s.starts_at, s.ends_at, e.title, v.name
         ORDER BY b.id DESC LIMIT 30`,
        [`%${query}%`]
      );
      searchResults = searchRes.rows;
    }

    // List today's showtimes for staff monitoring
    const todayShowtimesRes = await db.query(
      `SELECT s.*, e.title AS event_title, e.type AS event_type, v.name AS venue_name, v.capacity,
              (SELECT COUNT(*) FROM booking_seats bs WHERE bs.showtime_id = s.id AND bs.is_active = true) AS booked_count
       FROM showtimes s
       JOIN events e ON s.event_id = e.id
       JOIN venues v ON s.venue_id = v.id
       WHERE DATE(s.starts_at) = CURRENT_DATE
       ORDER BY s.starts_at ASC`
    );

    res.render('staff/index', {
      title: 'Bàn Làm Việc Nhân Viên (Quầy & Soát Vé)',
      query,
      searchResults,
      todayShowtimes: todayShowtimesRes.rows,
      error: req.query.error || null,
      success: req.query.success || null,
      user: req.session.user
    });
  } catch (err) {
    console.error('[STAFF DASHBOARD ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Lỗi tải trang nhân viên.', user: req.session.user });
  }
};

// GET /staff/showtimes/:id - View guest list & seat map for showtime
exports.getShowtimeGuests = async (req, res) => {
  const showtimeId = parseInt(req.params.id, 10);
  try {
    await cleanupOverdueBookings();

    const stRes = await db.query(
      `SELECT s.*, e.title AS event_title, e.duration_minutes, v.name AS venue_name,
              v.rows_count, v.seats_per_row, v.vip_rows, v.capacity
       FROM showtimes s
       JOIN events e ON s.event_id = e.id
       JOIN venues v ON s.venue_id = v.id
       WHERE s.id = $1`,
      [showtimeId]
    );

    if (stRes.rows.length === 0) {
      return res.status(404).render('error', { title: '404', message: 'Không tìm thấy suất chiếu.', user: req.session.user });
    }

    const showtime = stRes.rows[0];

    // Guest list
    const guestsRes = await db.query(
      `SELECT b.id AS booking_id, b.booking_code, b.status, b.total_amount, b.created_at, b.checked_in_at,
              u.full_name AS customer_name, u.email AS customer_email,
              STRING_AGG(bs.seat_label, ', ' ORDER BY bs.seat_label) AS seat_labels
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN booking_seats bs ON b.id = bs.booking_id
       WHERE b.showtime_id = $1 AND bs.is_active = true
       GROUP BY b.id, b.booking_code, b.status, b.total_amount, b.created_at, b.checked_in_at, u.full_name, u.email
       ORDER BY b.id DESC`,
      [showtimeId]
    );

    // Map of seat labels to occupant name
    const seatOccupantMap = {};
    const seatsRes = await db.query(
      `SELECT bs.seat_label, bs.seat_class, b.status, u.full_name
       FROM booking_seats bs
       JOIN bookings b ON bs.booking_id = b.id
       JOIN users u ON b.user_id = u.id
       WHERE bs.showtime_id = $1 AND bs.is_active = true`,
      [showtimeId]
    );

    seatsRes.rows.forEach(s => {
      seatOccupantMap[s.seat_label] = {
        name: s.full_name,
        status: s.status,
        class: s.seat_class
      };
    });

    res.render('staff/showtime_guests', {
      title: 'Danh Sách Khách & Sơ Đồ - ' + showtime.event_title,
      showtime,
      guests: guestsRes.rows,
      seatOccupantMap,
      user: req.session.user
    });
  } catch (err) {
    console.error('[SHOWTIME GUESTS ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Lỗi tải danh sách khách.', user: req.session.user });
  }
};

// POST /staff/bookings/:code/pay - Confirm payment at counter
exports.postConfirmPayment = async (req, res) => {
  const code = req.params.code;
  const username = req.session.user.username;
  const { payment_method, amount_paid } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const bookingRes = await client.query(
      `SELECT * FROM bookings WHERE booking_code = $1 FOR UPDATE`,
      [code]
    );

    if (bookingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.redirect('/staff?error=' + encodeURIComponent('Không tìm thấy mã đặt vé.'));
    }

    const booking = bookingRes.rows[0];

    if (booking.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.redirect('/staff?error=' + encodeURIComponent(`Đơn vé đang ở trạng thái "${booking.status}", không thể xác nhận thanh toán.`));
    }

    if (booking.expires_at && new Date(booking.expires_at) < new Date()) {
      await client.query(`UPDATE bookings SET status = 'expired' WHERE id = $1`, [booking.id]);
      await client.query(`UPDATE booking_seats SET is_active = false WHERE booking_id = $1`, [booking.id]);
      await client.query('COMMIT');
      console.log(`BOOKING_EXPIRED code=${code}`);
      return res.redirect('/staff?error=' + encodeURIComponent('Đơn vé này đã hết thời gian giữ chỗ (quá hạn).'));
    }

    const total = parseFloat(booking.total_amount);
    const paid = parseFloat(amount_paid || total);

    if (paid < total) {
      await client.query('ROLLBACK');
      return res.redirect('/staff?error=' + encodeURIComponent(`Số tiền khách đưa (${paid.toLocaleString()}đ) nhỏ hơn tổng tiền vé (${total.toLocaleString()}đ).`));
    }

    const change = paid - total;
    const method = ['cash', 'card', 'qr'].includes(payment_method) ? payment_method : 'cash';

    await client.query(
      `UPDATE bookings 
       SET status = 'confirmed', payment_method = $1, amount_paid = $2, change_amount = $3, paid_at = NOW()
       WHERE id = $4`,
      [method, paid, change, booking.id]
    );

    await client.query('COMMIT');

    console.log(`PAYMENT_CONFIRMED code=${code} method=${method} by=${username}`);
    res.redirect('/staff?success=' + encodeURIComponent(`Xác nhận thanh toán thành công cho đơn ${code}! Tiền thừa trả khách: ${change.toLocaleString()}đ`));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[CONFIRM PAYMENT ERROR]', err);
    res.redirect('/staff?error=' + encodeURIComponent('Lỗi máy chủ khi xác nhận thanh toán.'));
  } finally {
    client.release();
  }
};

// GET /staff/checkin
exports.getCheckin = (req, res) => {
  res.render('staff/checkin', {
    title: 'Soát Vé & Check-in',
    error: req.query.error || null,
    success: req.query.success || null,
    result: null,
    user: req.session.user
  });
};

// POST /staff/checkin - Process ticket checkin
exports.postCheckin = async (req, res) => {
  const code = (req.body.booking_code || '').trim().toUpperCase();
  const username = req.session.user.username;
  const staffId = req.session.user.id;

  if (!code) {
    return res.render('staff/checkin', {
      title: 'Soát Vé & Check-in',
      error: 'Vui lòng nhập mã đặt vé.',
      success: null,
      result: null,
      user: req.session.user
    });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const bookingRes = await client.query(
      `SELECT b.*, u.full_name AS customer_name,
              s.id AS showtime_id, s.starts_at, s.ends_at,
              e.title AS event_title, e.type AS event_type,
              v.name AS venue_name
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN showtimes s ON b.showtime_id = s.id
       JOIN events e ON s.event_id = e.id
       JOIN venues v ON s.venue_id = v.id
       WHERE b.booking_code = $1 FOR UPDATE`,
      [code]
    );

    if (bookingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      console.log(`CHECKIN_REJECTED code=${code} reason=not_found`);
      return res.render('staff/checkin', {
        title: 'Soát Vé & Check-in',
        error: `Mã vé "${code}" không tồn tại trên hệ thống.`,
        success: null,
        result: null,
        user: req.session.user
      });
    }

    const booking = bookingRes.rows[0];

    // Check if already checked in
    if (booking.status === 'checked_in') {
      await client.query('ROLLBACK');
      console.log(`CHECKIN_REJECTED code=${code} reason=already_checked_in`);
      const checkinTime = new Date(booking.checked_in_at).toLocaleTimeString('vi-VN');
      return res.render('staff/checkin', {
        title: 'Soát Vé & Check-in',
        error: `CẢNH BÁO: Vé "${code}" đã được soát vào lúc ${checkinTime}. Không thể check-in lần hai!`,
        success: null,
        result: null,
        user: req.session.user
      });
    }

    // Check if confirmed
    if (booking.status !== 'confirmed') {
      await client.query('ROLLBACK');
      console.log(`CHECKIN_REJECTED code=${code} reason=not_confirmed`);
      return res.render('staff/checkin', {
        title: 'Soát Vé & Check-in',
        error: `Vé "${code}" chưa được thanh toán hoặc không hợp lệ (Trạng thái: ${booking.status}).`,
        success: null,
        result: null,
        user: req.session.user
      });
    }

    // Check if same day (only allow checkin on the day of the showtime)
    const stDate = new Date(booking.starts_at);
    const now = new Date();
    const isSameDay = stDate.getFullYear() === now.getFullYear() &&
                      stDate.getMonth() === now.getMonth() &&
                      stDate.getDate() === now.getDate();

    if (!isSameDay) {
      await client.query('ROLLBACK');
      console.log(`CHECKIN_REJECTED code=${code} reason=wrong_day`);
      return res.render('staff/checkin', {
        title: 'Soát Vé & Check-in',
        error: `Từ chối soát vé: Suất chiếu diễn ra vào ngày ${stDate.toLocaleDateString('vi-VN')}. Chỉ được phép soát vé trong đúng ngày diễn ra suất chiếu!`,
        success: null,
        result: null,
        user: req.session.user
      });
    }

    // Check-in success!
    await client.query(
      `UPDATE bookings 
       SET status = 'checked_in', checked_in_at = NOW(), checked_in_by = $1 
       WHERE id = $2`,
      [staffId, booking.id]
    );

    // Fetch seats
    const seatsRes = await client.query(
      `SELECT seat_label, seat_class FROM booking_seats WHERE booking_id = $1 ORDER BY seat_label`,
      [booking.id]
    );

    await client.query('COMMIT');

    console.log(`CHECKIN_SUCCESS code=${code} showtime=${booking.showtime_id} by=${username}`);
    booking.seats = seatsRes.rows;

    res.render('staff/checkin', {
      title: 'Soát Vé & Check-in',
      error: null,
      success: `CHECK-IN HỢP LỆ! Mã vé ${code} đã được xác nhận vào cửa.`,
      result: booking,
      user: req.session.user
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[CHECKIN ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Lỗi máy chủ khi soát vé.', user: req.session.user });
  } finally {
    client.release();
  }
};

// POST /staff/bookings/:code/cancel - Staff cancels un-checked-in booking
exports.postCancelBookingStaff = async (req, res) => {
  const code = req.params.code;
  const username = req.session.user.username;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const bookingRes = await client.query(
      `SELECT * FROM bookings WHERE booking_code = $1 FOR UPDATE`,
      [code]
    );

    if (bookingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.redirect('/staff?error=' + encodeURIComponent('Không tìm thấy vé.'));
    }

    const booking = bookingRes.rows[0];

    if (booking.status === 'checked_in') {
      await client.query('ROLLBACK');
      return res.redirect('/staff?error=' + encodeURIComponent('Vé đã soát vào cửa, không thể hủy.'));
    }

    await client.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [booking.id]);
    await client.query(`UPDATE booking_seats SET is_active = false WHERE booking_id = $1`, [booking.id]);

    await client.query('COMMIT');

    console.log(`BOOKING_CANCELLED code=${code} by=${username}`);
    res.redirect('/staff?success=' + encodeURIComponent(`Hủy vé ${code} thành công và đã giải phóng ghế!`));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[STAFF CANCEL ERROR]', err);
    res.redirect('/staff?error=' + encodeURIComponent('Lỗi khi hủy vé.'));
  } finally {
    client.release();
  }
};
