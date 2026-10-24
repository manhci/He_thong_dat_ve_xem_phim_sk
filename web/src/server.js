require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const csrfProtection = require('./middleware/csrf');
const { startBackgroundCleaner } = require('./services/cleaner');

const app = express();

// Hardening: An header X-Powered-By
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (for X-Forwarded-For IP & secure cookies)
app.set('trust proxy', 1);

// EJS View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Static assets
app.use(express.static(path.join(__dirname, '../public')));

// Body parsing with 2MB limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// Express Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'cinema_session_default_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: 'auto', // Tu dong Secure khi qua HTTPS Nginx reverse proxy
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// CSRF Protection
app.use(csrfProtection);

// Global view variables
app.use((req, res, next) => {
  res.locals.currentUser = req.session ? req.session.user : null;
  res.locals.currentPath = req.path;
  next();
});

// Register routes
app.use(require('./routes/healthRoutes'));
app.use(require('./routes/authRoutes'));
app.use(require('./routes/movieRoutes'));
app.use(require('./routes/bookingRoutes'));
app.use(require('./routes/staffRoutes'));
app.use(require('./routes/adminRoutes'));

// 404 Handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Không Tìm Thấy Trang',
    message: 'Trang bạn đang tìm kiếm không tồn tại hoặc đã bị xóa.',
    user: req.session ? req.session.user : null
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[UNHANDLED APP ERROR]', err);
  if (err.message && err.message.includes('Chỉ chấp nhận các tệp ảnh hợp lệ')) {
    return res.status(400).render('error', {
      title: 'Tệp Không Hợp Lệ',
      message: err.message,
      user: req.session ? req.session.user : null
    });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).render('error', {
      title: 'Dung Lượng Quá Lớn',
      message: 'Kích thước tệp tải lên vượt quá giới hạn cho phép (Tối đa 2 MB).',
      user: req.session ? req.session.user : null
    });
  }
  res.status(500).render('error', {
    title: '500 - Lỗi Máy Chủ',
    message: 'Đã xảy ra sự cố nội bộ trong hệ thống.',
    user: req.session ? req.session.user : null
  });
});

// Start background expired bookings cleaner
startBackgroundCleaner();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[CINEMA WEB SERVER] Running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
});
