const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { requireRole } = require('../middleware/auth');

router.use(requireRole('staff'));

router.get('/staff', staffController.getStaffDashboard);
router.get('/staff/showtimes/:id', staffController.getShowtimeGuests);
router.post('/staff/bookings/:code/pay', staffController.postConfirmPayment);
router.post('/staff/bookings/:code/cancel', staffController.postCancelBookingStaff);
router.get('/staff/checkin', staffController.getCheckin);
router.post('/staff/checkin', staffController.postCheckin);

module.exports = router;
