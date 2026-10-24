const db = require('../config/db');

// Function to expire overdue pending bookings and release active seats
async function cleanupOverdueBookings(client = null) {
  const runQuery = client ? (q, p) => client.query(q, p) : (q, p) => db.query(q, p);
  try {
    // Find all expired pending bookings
    const expiredRes = await runQuery(
      `SELECT id, booking_code, showtime_id 
       FROM bookings 
       WHERE status = 'pending' AND expires_at < NOW()`
    );

    if (expiredRes.rows.length > 0) {
      for (const booking of expiredRes.rows) {
        await runQuery(
          `UPDATE bookings SET status = 'expired' WHERE id = $1`,
          [booking.id]
        );
        await runQuery(
          `UPDATE booking_seats SET is_active = false WHERE booking_id = $1`,
          [booking.id]
        );
        console.log(`BOOKING_EXPIRED code=${booking.booking_code}`);
      }
    }
  } catch (err) {
    console.error('[CLEANER ERROR]', err.message);
  }
}

// Background cleaner runs every 30 seconds
function startBackgroundCleaner() {
  setInterval(() => {
    cleanupOverdueBookings();
  }, 30000);
}

module.exports = {
  cleanupOverdueBookings,
  startBackgroundCleaner,
};
