# Báo Cáo Phân Tích Sự Cố An Toàn Thông Tin: Tấn Công Dò Mật Khẩu (Brute Force)

| Thông Tin Chung | Chi Tiết |
|-----------------|----------|
| **Dự án** | Hệ thống Đặt vé Xem phim & Sự kiện trực tuyến (Cinema & Event Booking System) |
| **Hệ thống giám sát** | Grafana Alerting + Loki + Promtail + Alert-Sink Webhook |
| **Người thực hiện** | Đoàn Ngọc Mạnh (MSSV: DTC245180048) |
| **Mức độ nghiêm trọng** | **CRITICAL** (Nguy cơ rò rỉ tài khoản Quản trị viên cấp cao) |
| **Trạng thái xử lý** | **ĐÃ KHẮC PHỤC TRIỆT ĐỂ** (Triển khai Rate Limiting trên Reverse Proxy Nginx) |

---

## 1. Mô Tả Sự Cố (Incident Description)
- **Hiện tượng**: Vào lúc **2026-10-24 20:33:40**, hệ thống giám sát ghi nhận lượng lớn yêu cầu đăng nhập liên tục với tốc độ bất thường nhắm vào endpoint xác thực `/login` trên cổng bảo mật HTTPS (443).
- **Hành vi tấn công**: Kẻ tấn công sử dụng công cụ tự động (`scripts/simulate_bruteforce.sh`) gửi 20 yêu cầu POST đăng nhập liên tiếp với tên người dùng cố định là `admin`, kết hợp với danh sách mật khẩu phổ biến (từ điển mật khẩu yếu) với tần suất ~0.5 giây/yêu cầu.
- **Rủi ro an ninh**:
  - Nguy cơ lộ lọt mật khẩu tài khoản quản trị hệ thống nếu mật khẩu quản trị viên nằm trong danh sách từ điển.
  - Tấn công làm cạn kiệt tài nguyên CPU do thuật toán băm mật khẩu `bcrypt.compare()` trong ứng dụng Node.js tốn nhiều chu kỳ tính toán, có thể gây quá tải máy chủ (Denial of Service - DoS).

---

## 2. Cơ Chế Phát Hiện (Detection Mechanism)
Hệ thống phát hiện sự cố hoàn toàn tự động thông qua chuỗi giám sát log và cảnh báo thời gian thực:
1. **Thu thập Log**:
   - Container ứng dụng `cinema_web` ghi nhận mỗi lần xác thực sai bằng dòng log có cấu trúc:
     `LOGIN_FAILED ip=<ip> user=<username> reason=wrong_password`
   - Promtail và module Docker Log Shipper đọc trực tiếp dòng log qua Docker Engine API socket (`/var/run/docker.sock`) và gắn nhãn chuẩn `job="webapp"`, `container="cinema_web"`, `compose_service="web"`, sau đó đẩy tức thời vào Loki (`http://loki:3100`).
2. **Quy tắc Cảnh báo (Grafana Alert Rule)**:
   - **Tên Rule**: `Cinema - Brute force login` (UID: `cinema-bruteforce-alert`)
   - **Thư mục**: `Cinema Monitoring` / Nhóm: `Cinema Security Alerts`
   - **Truy vấn LogQL**:
     ```logql
     sum(count_over_time({job="webapp"} |= "LOGIN_FAILED" [1m]))
     ```
   - **Điều kiện kích hoạt**: Giá trị đếm số lần `LOGIN_FAILED` trong 1 phút vượt quá ngưỡng **> 5**.
   - **Mức độ (Severity)**: `critical`
   - **Độ trễ đánh giá (For)**: `0s` (Kích hoạt ngay khi vượt ngưỡng).
3. **Kênh nhận thông báo (Contact Point & Alert Sink)**:
   - Khi ngưỡng cảnh báo bị vi phạm, Grafana Alertmanager lập tức gửi bản tin thông báo (Webhook JSON POST) tới container `cinema_alert_sink` tại địa chỉ nội bộ `http://alert-sink:5001/webhook`.
   - `alert-sink` in thông báo cảnh báo ra `stdout` (giúp đồng thời được Loki ghi nhận) và lưu vào tệp `/app/alerts.log`.

---

## 3. Quá Trình Điều Tra & Truy Vết (LogQL Forensics)
Sử dụng công cụ truy vấn **LogQL** trên Loki API và Grafana Explore, đội ngũ quản trị đã tái hiện toàn bộ dấu vết của đợt tấn công:

### 3.1. Xác định Nguồn và Mục Tiêu Tấn Công
- **Câu lệnh LogQL**:
  ```logql
  {job="webapp"} |= "LOGIN_FAILED"
  ```
- **Kết quả điều tra thực tế**:
  - **Địa chỉ IP nguồn**: `127.0.0.1` (truy cập qua mạng loopback máy chủ/container proxy).
  - **Tài khoản bị nhắm tới**: `admin`
  - **Lý do lỗi**: `reason=wrong_password`
  - **Thời điểm thử đầu tiên**: `2026-10-24 20:33:40`
  - **Thời điểm thử cuối cùng**: `2026-10-24 20:33:53`
  - **Tổng số lần thử sai**: 20 lần thử trong thời gian ~10 giây.

### 3.2. Đối Chiếu với Nhật Ký Truy Cập Nginx
- **Câu lệnh LogQL**:
  ```logql
  {job="nginx"} |= "POST /login"
  ```
- **Kết quả đối chiếu**:
  - Ghi nhận 20 dòng nhật ký truy cập HTTP POST gửi đến `/login` cùng từ IP nguồn trong khung thời gian tương ứng.
  - Khi chưa áp dụng cơ chế bảo vệ, toàn bộ 20 yêu cầu đều được Nginx chuyển tiếp tới ứng dụng Node.js và trả về mã `HTTP 200` (render lại trang đăng nhập với thông báo lỗi).

---

## 4. Phương Án Xử Lý & Khắc Phục Đề Xuất (Remediation & Hardening)

### 4.1. Biện pháp đã thực hiện ngay (Immediate Hardening)
Gia cố lớp phòng thủ tại tầng Reverse Proxy Nginx bằng thuật toán **Leaky Bucket / Token Bucket**:
1. Khai báo vùng nhớ theo dõi tần suất yêu cầu theo địa chỉ IP nhị phân (`$binary_remote_addr`):
   ```nginx
   limit_req_zone $binary_remote_addr zone=login_limit:10m rate=10r/m;
   limit_req_status 429;
   ```
2. Áp dụng giới hạn riêng cho endpoint đăng nhập `/login`:
   ```nginx
   location = /login {
       limit_req zone=login_limit burst=5 nodelay;
       proxy_pass http://web:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```
3. **Hiệu quả kiểm chứng sau gia cố**:
   - Chạy lại kịch bản brute force: Nginx chỉ cho phép tối đa 5 yêu cầu đầu tiên đi qua (`burst=5`).
   - Kể từ yêu cầu thứ 6 đến thứ 20, Nginx **lập tức từ chối** và trả về mã trạng thái **`HTTP 429 Too Many Requests`**.
   - Các yêu cầu độc hại bị chặn đứng ngay tại biên mạng Nginx, **không chạm tới container Node.js**, bảo vệ tuyệt đối năng lực xử lý của máy chủ web và database.
   - Người dùng thông thường với hành vi đăng nhập bình thường vẫn thực hiện đăng nhập và chuyển hướng (`HTTP 302`) hoàn toàn suôn sẻ.

### 4.2. Đề xuất tăng cường an toàn dài hạn (Long-term Recommendations)
1. **Khóa tài khoản tạm thời (Account Lockout)**: Khóa tài khoản người dùng trong 15-30 phút nếu đăng nhập sai quá 5 lần liên tiếp trong CSDL.
2. **Cơ chế xác thực 2 yếu tố (2FA / TOTP)**: Bắt buộc áp dụng 2FA đối với các tài khoản có quyền `admin` và `staff`.
3. **Tích hợp CAPTCHA**: Hiển thị CAPTCHA (như Cloudflare Turnstile hoặc reCAPTCHA) sau 3 lần đăng nhập sai.
4. **Tích hợp Fail2ban / CrowdSec**: Tự động cấu hình iptables chặn tạm thời các IP có dấu hiệu quét cổng hoặc brute force.

---

## 5. Bài Học Kinh Nghiệm (Lessons Learned)
1. **Phòng thủ theo chiều sâu (Defense-in-Depth)**: Không thể phụ thuộc duy nhất vào tầng ứng dụng để xử lý tấn công brute force; việc chặn lọc sớm tại tầng Reverse Proxy Nginx giúp bảo vệ tài nguyên tính toán của toàn bộ hệ thống.
2. **Log tập trung là huyết mạch của SOC/DevOps**: Hệ thống Loki + Promtail cho phép truy vết sự cố đa thành phần (Nginx + Webapp + DB) trong một giao diện duy nhất chỉ trong vài giây.
3. **Cảnh báo tức thời (Realtime Alerting)**: Cấu hình rule cảnh báo với chu kỳ đánh giá ngắn và contact point webhook tự lưu trữ (`alert-sink`) giúp đội ngũ vận hành phản ứng nhanh chóng với sự cố trước khi xảy ra hậu quả nghiêm trọng.
