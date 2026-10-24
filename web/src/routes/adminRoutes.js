const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const kpiController = require('../controllers/kpiController');
const upload = require('../middleware/upload');
const { requireRole } = require('../middleware/auth');

router.use(requireRole('admin'));

// Middleware to validate CSRF token for multipart form submissions
function validateMultipartCsrf(req, res, next) {
  const token = (req.body && req.body._csrf) || (req.query && req.query._csrf) || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).render('error', {
      title: '403 - Lỗi CSRF Token',
      message: 'Yêu cầu không hợp lệ hoặc phiên làm việc đã hết hạn. Vui lòng tải lại trang.',
      user: req.session ? req.session.user : null
    });
  }
  next();
}

// KPI Dashboard
router.get('/admin/dashboard', kpiController.getDashboard);

// Categories CRUD
router.get('/admin/categories', adminController.getCategories);
router.post('/admin/categories', adminController.postCreateCategory);
router.post('/admin/categories/:id/delete', adminController.postDeleteCategory);

// Venues CRUD
router.get('/admin/venues', adminController.getVenues);
router.post('/admin/venues', adminController.postCreateVenue);
router.post('/admin/venues/:id/delete', adminController.postDeleteVenue);

// Events CRUD & Poster upload
router.get('/admin/events', adminController.getEvents);
router.post('/admin/events', upload.single('poster'), validateMultipartCsrf, adminController.postCreateEvent);
router.post('/admin/events/:id/status', adminController.postUpdateEventStatus);

// Showtimes CRUD
router.get('/admin/showtimes', adminController.getShowtimes);
router.post('/admin/showtimes', adminController.postCreateShowtime);
router.post('/admin/showtimes/:id/cancel', adminController.postCancelShowtime);

// Staff Management
router.get('/admin/staff', adminController.getStaffList);
router.post('/admin/staff', adminController.postCreateStaff);
router.post('/admin/staff/:id/toggle', adminController.postToggleStaffActive);

module.exports = router;
