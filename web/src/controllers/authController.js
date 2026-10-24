const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { getClientIp } = require('../middleware/auth');

// GET /login
exports.getLogin = (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('auth/login', {
    title: 'Đăng Nhập',
    error: req.query.error || null,
    success: req.query.success || null,
    user: null
  });
};

// POST /login
exports.postLogin = async (req, res) => {
  const { username, password } = req.body;
  const ip = getClientIp(req);

  try {
    const userRes = await db.query(
      'SELECT id, username, email, password_hash, full_name, role, is_active FROM users WHERE username = $1',
      [username]
    );

    if (userRes.rows.length === 0) {
      console.log(`LOGIN_FAILED ip=${ip} user=${username} reason=unknown_user`);
      return res.render('auth/login', {
        title: 'Đăng Nhập',
        error: 'Tài khoản không tồn tại trên hệ thống.',
        success: null,
        user: null
      });
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      console.log(`LOGIN_FAILED ip=${ip} user=${username} reason=inactive`);
      return res.render('auth/login', {
        title: 'Đăng Nhập',
        error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.',
        success: null,
        user: null
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.log(`LOGIN_FAILED ip=${ip} user=${username} reason=wrong_password`);
      return res.render('auth/login', {
        title: 'Đăng Nhập',
        error: 'Mật khẩu không chính xác.',
        success: null,
        user: null
      });
    }

    // Login successful
    console.log(`LOGIN_SUCCESS ip=${ip} user=${username}`);
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role
    };

    const returnTo = req.session.returnTo || (user.role === 'customer' ? '/' : (user.role === 'admin' ? '/admin/dashboard' : '/staff'));
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Lỗi máy chủ khi đăng nhập.', user: null });
  }
};

// GET /register
exports.getRegister = (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('auth/register', {
    title: 'Đăng Ký Khách Hàng',
    error: null,
    user: null
  });
};

// POST /register
exports.postRegister = async (req, res) => {
  const { username, email, password, full_name } = req.body;

  try {
    if (!username || !email || !password || !full_name) {
      return res.render('auth/register', {
        title: 'Đăng Ký Khách Hàng',
        error: 'Vui lòng điền đầy đủ tất cả các trường.',
        user: null
      });
    }

    const checkRes = await db.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (checkRes.rows.length > 0) {
      return res.render('auth/register', {
        title: 'Đăng Ký Khách Hàng',
        error: 'Tên đăng nhập hoặc Email đã được sử dụng.',
        user: null
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, email, password_hash, full_name, role, is_active) VALUES ($1, $2, $3, $4, $5, true)',
      [username, email, passwordHash, full_name, 'customer']
    );

    res.redirect('/login?success=' + encodeURIComponent('Đăng ký tài khoản thành công! Vui lòng đăng nhập.'));
  } catch (err) {
    console.error('[REGISTER ERROR]', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Lỗi máy chủ khi đăng ký.', user: null });
  }
};

// POST /logout
exports.postLogout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
};
