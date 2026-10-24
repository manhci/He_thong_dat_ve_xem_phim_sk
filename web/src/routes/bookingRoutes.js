const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { requireAuth } = require('../middleware/auth');

// Seat Map & Polling API
router.get('/showtimes/:id/book', requireAuth, bookingController.getSeatMap);
router.get('/showtimes/:id/seats', bookingController.getSeatStatusApi);
router.post('/showtimes/:id/book', requireAuth, bookingController.postBookSeats);

// Customer bookings & Tickets
router.get('/my-bookings', requireAuth, bookingController.getMyBookings);
router.get('/bookings/:code', bookingController.getTicket);
router.post('/bookings/:code/cancel', requireAuth, bookingController.postCancelBooking);

module.exports = router;
