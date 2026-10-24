const db = require('../config/db');
const crypto = require('crypto');
const qrcode = require('qrcode');
const { cleanupOverdueBookings } = require('../services/cleaner');

// Helper to calculate seat class given row index and venue vip_rows
function getSeatClass(rowIndex, totalRows, vipRows) {
  // vip_rows are the LAST rows of the venue
  const firstVipRowIndex = totalRows - vipRows;
  return (rowIndex >= firstVipRowIndex && vipRows > 0) ? 'vip' : 'standard';
}

// GET /showtimes/:id/book - Seat selection page
exports.getSeatMap = async (req, res) => {
  const showtimeId = parseInt(req.params.id, 10);
  try {
    await cleanupOverdueBookings();

    const stRes = await db.query(
      `SELECT s.*, e.title AS event_title, e.type AS event_type, e.poster_path, e.age_rating,
              v.name AS venue_name, v.rows_count, v.seats_per_row, v.vip_rows, v.capacity
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

    if (showtime.status !== 'scheduled' || new Date(showtime.starts_at) <= new Date()) {
      return res.status(400).render('error', {
        title: 'Không thể đặt vé',
        message: 'Suất chiếu này đã bắt đầu hoặc đã kết thúc/hủy, không thể đặt vé.',
        user: req.session.user
      });
    }

    // Fetch active booked seats
    const seatsRes = await db.query(
      `SELECT bs.seat_label, bs.seat_class, b.status AS booking_status, b.user_id
       FROM booking_seats bs
       JOIN bookings b ON bs.booking_id = b.id
       WHERE bs.showtime_id = $1 AND bs.is_active = true`,
      [showtimeId]
    );

    const occupiedMap = {};
    const currentUserId = req.session.user ? req.session.user.id : null;

    seatsRes.rows.forEach(s => {
      occupiedMap[s.seat_label] = {
        status: s.booking_status,
        isMine: s.user_id === currentUserId
      };
    });

    res.render('booking', {
      title: 'Chọn Ghế - ' + showtime.event_title,
      showtime,
      occupiedMap,
      error: req.query.error || null,
      user: req.session.user
    });
  } catch (err) {
    console.error('[SEAT MAP ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Lỗi tải sơ đồ ghế.', user: req.session.user });
  }
};

// GET /showtimes/:id/seats - JSON Polling API (every ~10s)
exports.getSeatStatusApi = async (req, res) => {
  const showtimeId = parseInt(req.params.id, 10);
  try {
    await cleanupOverdueBookings();

    const seatsRes = await db.query(
      `SELECT bs.seat_label, bs.seat_class, b.status AS booking_status, b.user_id
       FROM booking_seats bs
       JOIN bookings b ON bs.booking_id = b.id
       WHERE bs.showtime_id = $1 AND bs.is_active = true`,
      [showtimeId]
    );

    const currentUserId = req.session.user ? req.session.user.id : null;
    const occupiedSeats = seatsRes.rows.map(s => ({
      label: s.seat_label,
      class: s.seat_class,
      status: s.booking_status === 'pending' ? (s.user_id === currentUserId ? 'mine' : 'holding') : 'booked'
    }));

    res.json({ success: true, seats: occupiedSeats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /showtimes/:id/book - Customer books seats in a strict transaction
exports.postBookSeats = async (req, res) => {
  const showtimeId = parseInt(req.params.id, 10);
  const username = req.session.user ? req.session.user.username : 'anonymous';
  const userId = req.session.user ? req.session.user.id : null;

  let selectedSeats = req.body.seats;
  if (typeof selectedSeats === 'string') {
    selectedSeats = [selectedSeats];
  } else if (!Array.isArray(selectedSeats)) {
    selectedSeats = [];
  }

  // Filter out any empty strings and normalize
  selectedSeats = selectedSeats.map(s => s.trim().toUpperCase()).filter(s => s.length > 0);

  // Validate seat count (1 to 8 seats)
  if (selectedSeats.length === 0 || selectedSeats.length > 8) {
    return res.status(400).render('error', {
      title: 'Lỗi Đặt Vé',
      message: 'Mỗi lần đặt vé chỉ được chọn tối thiểu 1 và tối đa 8 ghế.',
      user: req.session.user
    });
  }

  // Check for duplicates in user request
  const uniqueSelected = Array.from(new Set(selectedSeats));
  if (uniqueSelected.length !== selectedSeats.length) {
    return res.status(400).render('error', {
      title: 'Lỗi Đặt Vé',
      message: 'Danh sách ghế chọn không được trùng nhau.',
      user: req.session.user
    });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock the showtime row for update
    const stRes = await client.query(
      `SELECT s.*, v.rows_count, v.seats_per_row, v.vip_rows 
       FROM showtimes s
       JOIN venues v ON s.venue_id = v.id
       WHERE s.id = $1 FOR UPDATE`,
      [showtimeId]
    );

    if (stRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).render('error', { title: '404', message: 'Không tìm thấy suất chiếu.', user: req.session.user });
    }

    const showtime = stRes.rows[0];

    if (showtime.status !== 'scheduled' || new Date(showtime.starts_at) <= new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).render('error', {
        title: 'Suất Chiếu Không Hợp Lệ',
        message: 'Suất chiếu đã bắt đầu hoặc đã bị hủy.',
        user: req.session.user
      });
    }

    // 2. Validate seat labels within venue grid (rows A, B, C... cols 1..seats_per_row)
    const totalRows = showtime.rows_count;
    const seatsPerRow = showtime.seats_per_row;
    const vipRows = showtime.vip_rows;

    const validatedSeats = [];
    let calculatedTotal = 0;

    for (const seat of selectedSeats) {
      const match = seat.match(/^([A-Z])([0-9]{1,2})$/);
      if (!match) {
        await client.query('ROLLBACK');
        return res.status(400).render('error', {
          title: 'Nhãn Ghế Không Hợp Lệ',
          message: `Nhãn ghế "${seat}" không đúng định dạng.`,
          user: req.session.user
        });
      }

      const rowChar = match[1];
      const colNum = parseInt(match[2], 10);
      const rowIndex = rowChar.charCodeAt(0) - 65; // A=0, B=1, ...

      if (rowIndex < 0 || rowIndex >= totalRows || colNum < 1 || colNum > seatsPerRow) {
        await client.query('ROLLBACK');
        return res.status(400).render('error', {
          title: 'Ghế Ngoài Sơ Đồ',
          message: `Ghế "${seat}" nằm ngoài sơ đồ phòng chiếu.`,
          user: req.session.user
        });
      }

      const seatClass = getSeatClass(rowIndex, totalRows, vipRows);
      const seatPrice = seatClass === 'vip' ? parseFloat(showtime.price_vip) : parseFloat(showtime.price_standard);
      calculatedTotal += seatPrice;

      validatedSeats.push({
        label: seat,
        class: seatClass,
        price: seatPrice
      });
    }

    // 3. Auto-expire any overdue pending bookings for this showtime within this transaction
    await cleanupOverdueBookings(client);

    // 4. Generate random unique booking code
    const bookingCode = 'BK-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // 5. Determine status and expiration
    const isFree = calculatedTotal === 0;
    const status = isFree ? 'confirmed' : 'pending';
    const expiresAt = isFree ? null : new Date(Date.now() + 10 * 60 * 1000); // 10 minutes hold
    const paidAt = isFree ? new Date() : null;

    // 6. Insert booking
    const bookingRes = await client.query(
      `INSERT INTO bookings (booking_code, user_id, showtime_id, status, total_amount, payment_method, amount_paid, change_amount, created_at, expires_at, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NOW(), $8, $9)
       RETURNING id`,
      [bookingCode, userId, showtimeId, status, calculatedTotal, isFree ? 'cash' : null, isFree ? 0 : 0, expiresAt, paidAt]
    );

    const bookingId = bookingRes.rows[0].id;

    // 7. Insert booking_seats (PostgreSQL partial unique index will catch concurrent duplicate seat reservations)
    for (const seat of validatedSeats) {
      await client.query(
        `INSERT INTO booking_seats (booking_id, showtime_id, seat_label, seat_class, price, is_active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [bookingId, showtimeId, seat.label, seat.class, seat.price]
      );
    }

    await client.query('COMMIT');

    console.log(`BOOKING_CREATED code=${bookingCode} showtime=${showtimeId} seats=${validatedSeats.length} user=${username}`);
    res.redirect(`/bookings/${bookingCode}`);
  } catch (err) {
    await client.query('ROLLBACK');

    // Check for PostgreSQL unique violation (code 23505) on idx_booking_seats_active
    if (err.code === '23505') {
      console.log(`SEAT_CONFLICT showtime=${showtimeId} seats=${selectedSeats.join(',')} user=${username}`);
      return res.status(409).render('booking_conflict', {
        title: 'Xung Đột Đặt Ghế',
        message: 'Rất tiếc! Một hoặc nhiều ghế bạn chọn vừa được người khác đặt trước. Vui lòng chọn ghế khác.',
        showtimeId,
        user: req.session.user
      });
    }

    console.error('[BOOKING TRANSACTION ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Lỗi máy chủ khi xử lý giao dịch đặt vé.', user: req.session.user });
  } finally {
    client.release();
  }
};

// GET /my-bookings - List customer's own bookings
exports.getMyBookings = async (req, res) => {
  try {
    await cleanupOverdueBookings();

    const bookingsRes = await db.query(
      `SELECT b.*, s.starts_at, s.ends_at, e.title AS event_title, e.type AS event_type, v.name AS venue_name,
              STRING_AGG(bs.seat_label, ', ' ORDER BY bs.seat_label) AS seat_labels
       FROM bookings b
       JOIN showtimes s ON b.showtime_id = s.id
       JOIN events e ON s.event_id = e.id
       JOIN venues v ON s.venue_id = v.id
       LEFT JOIN booking_seats bs ON b.id = bs.booking_id
       WHERE b.user_id = $1
       GROUP BY b.id, s.starts_at, s.ends_at, e.title, e.type, v.name
       ORDER BY b.id DESC`,
      [req.session.user.id]
    );

    res.render('my_bookings', {
      title: 'Vé Của Tôi',
      bookings: bookingsRes.rows,
      user: req.session.user
    });
  } catch (err) {
    console.error('[MY BOOKINGS ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải danh sách vé.', user: req.session.user });
  }
};

// GET /bookings/:code - E-ticket with QR code (IDOR Protected)
exports.getTicket = async (req, res) => {
  const code = req.params.code;
  try {
    await cleanupOverdueBookings();

    const bookingRes = await db.query(
      `SELECT b.*, u.full_name AS customer_name, u.email AS customer_email,
              s.starts_at, s.ends_at, e.title AS event_title, e.type AS event_type, e.poster_path,
              v.name AS venue_name, v.address AS venue_address
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN showtimes s ON b.showtime_id = s.id
       JOIN events e ON s.event_id = e.id
       JOIN venues v ON s.venue_id = v.id
       WHERE b.booking_code = $1`,
      [code]
    );

    if (bookingRes.rows.length === 0) {
      return res.status(404).render('error', { title: '404', message: 'Không tìm thấy thông tin đặt vé.', user: req.session.user });
    }

    const booking = bookingRes.rows[0];

    // IDOR Protection: Only the booking owner or staff/admin can view ticket
    const currentUser = req.session.user;
    const isOwner = currentUser && currentUser.id === booking.user_id;
    const isStaffOrAdmin = currentUser && ['staff', 'admin'].includes(currentUser.role);

    if (!isOwner && !isStaffOrAdmin) {
      return res.status(403).render('error', {
        title: '403 - Cấm Truy Cập',
        message: 'Bạn không có quyền xem thông tin vé của khách hàng khác.',
        user: currentUser
      });
    }

    // Fetch seats for this booking
    const seatsRes = await db.query(
      `SELECT seat_label, seat_class, price FROM booking_seats WHERE booking_id = $1 ORDER BY seat_label`,
      [booking.id]
    );
    booking.seats = seatsRes.rows;

    // Generate QR Code if confirmed or checked_in
    let qrDataUrl = null;
    if (['pending', 'confirmed', 'checked_in'].includes(booking.status)) {
      qrDataUrl = await qrcode.toDataURL(booking.booking_code, {
        width: 200,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' }
      });
    }

    res.render('ticket', {
      title: 'Vé Điện Tử - ' + booking.booking_code,
      booking,
      qrDataUrl,
      user: currentUser
    });
  } catch (err) {
    console.error('[TICKET ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Lỗi tải vé điện tử.', user: req.session.user });
  }
};

// POST /bookings/:code/cancel - Customer cancels booking before start time
exports.postCancelBooking = async (req, res) => {
  const code = req.params.code;
  const username = req.session.user.username;
  const userId = req.session.user.id;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const bookingRes = await client.query(
      `SELECT b.*, s.starts_at 
       FROM bookings b
       JOIN showtimes s ON b.showtime_id = s.id
       WHERE b.booking_code = $1 FOR UPDATE`,
      [code]
    );

    if (bookingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).render('error', { title: '404', message: 'Không tìm thấy đặt vé.', user: req.session.user });
    }

    const booking = bookingRes.rows[0];

    // Only owner can cancel via this route
    if (booking.user_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).render('error', { title: '403', message: 'Bạn không thể hủy vé của người khác.', user: req.session.user });
    }

    if (new Date(booking.starts_at) <= new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).render('error', { title: 'Không Thể Hủy', message: 'Suất chiếu đã bắt đầu, không thể hủy vé.', user: req.session.user });
    }

    if (booking.status === 'checked_in' || booking.status === 'cancelled' || booking.status === 'expired') {
      await client.query('ROLLBACK');
      return res.status(400).render('error', { title: 'Không Thể Hủy', message: `Vé đang ở trạng thái "${booking.status}", không thể hủy.`, user: req.session.user });
    }

    await client.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [booking.id]);
    await client.query(`UPDATE booking_seats SET is_active = false WHERE booking_id = $1`, [booking.id]);

    await client.query('COMMIT');

    console.log(`BOOKING_CANCELLED code=${code} by=${username}`);
    res.redirect('/my-bookings');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[CANCEL BOOKING ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể hủy vé.', user: req.session.user });
  } finally {
    client.release();
  }
};
