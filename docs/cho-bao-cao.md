# TÀI LIỆU TỔNG HỢP NỘI DUNG VÀ MINH CHỨNG PHỤC VỤ BÁO CÁO BÀI TẬP LỚN

> **Học phần:** Triển khai và Quản trị Hệ thống Phần mềm  
> **Đề tài:** Hệ thống Đặt vé Xem phim & Sự kiện trực tuyến (Cinema & Event Booking System)  
> **Sinh viên:** Đoàn Ngọc Mạnh  
> **Mã sinh viên:** DTC245180048  
> **Kho lưu trữ:** `He_thong_dat_ve_xem_phim_sk` (https://github.com/manhci/He_thong_dat_ve_xem_phim_sk)  
> **Lịch sử Git:** Chuẩn xác các mốc COMMIT (Commit 1: `49944b0`, Commit 2: `1860081`, Commit 3: `e4b0eaa`)

---

## BẢNG THÀNH PHẦN - PHIÊN BẢN VÀ THÔNG SỐ CONTAINER THỰC TẾ

| STT | Tên Service | Image thực tế | Cổng nội bộ | Publish cổng Host | User thực tế (UID:GID) | Giới hạn tài nguyên (CPU / RAM) | Mạng kết nối |
|:---:|---|---|:---:|:---:|:---:|:---:|---|
| 1 | `cinema_nginx` | `nginxinc/nginx-unprivileged:1.27.1-alpine` | 8080, 8443 | **80, 443** (Duy nhất) | `101:101` (nginx) | 0.5 CPU / 128 MB | `cinema_frontend` |
| 2 | `cinema_web` | Build từ `./web` (`node:20.18-alpine`) | 3000 | Không mở | `1000:1000` (node) | 1.0 CPU / 512 MB | `cinema_frontend`, `cinema_backend` |
| 3 | `cinema_db` | `postgres:16.4-alpine` | 5432 | Không mở | `70:70` (postgres) | 1.0 CPU / 512 MB | `cinema_backend` (`internal: true`) |
| 4 | `cinema_pgadmin` | `dpage/pgadmin4:8.11` | 80, 443 | Không mở | `5050:0` (pgadmin) | 0.5 CPU / 384 MB | `cinema_frontend`, `cinema_backend` |
| 5 | `cinema_prometheus` | `prom/prometheus:v2.54.1` | 9090 | Không mở | `65534:65534` (nobody) | 0.5 CPU / 512 MB | `cinema_monitoring` |
| 6 | `cinema_grafana` | `grafana/grafana:11.2.0` | 3000 | Không mở | `472:472` (grafana) | 0.5 CPU / 384 MB | `cinema_frontend`, `cinema_monitoring` |
| 7 | `cinema_cadvisor` | `gcr.io/cadvisor/cadvisor:v0.49.1` | 8080 | Không mở | `0:0` (root - cgroups) | 0.3 CPU / 192 MB | `cinema_monitoring` |
| 8 | `cinema_nginx_exporter` | `nginx/nginx-prometheus-exporter:1.3.0` | 9113 | Không mở | `65534:65534` (nobody) | 0.2 CPU / 64 MB | `cinema_frontend`, `cinema_monitoring` |
| 9 | `cinema_postgres_exporter`| `prometheuscommunity/postgres-exporter:v0.15.0`| 9187 | Không mở | `65534:65534` (nobody) | 0.2 CPU / 64 MB | `cinema_backend`, `cinema_monitoring` |
| 10| `cinema_loki` | `grafana/loki:3.1.1` | 3100 | Không mở | `10001:10001` (loki) | 0.5 CPU / 384 MB | `cinema_monitoring` |
| 11| `cinema_promtail` | `grafana/promtail:3.1.1` | 9080 | Không mở | `0:0` (root - docker.sock) | 0.3 CPU / 192 MB | `cinema_monitoring` |
| 12| `cinema_alert_sink` | Build từ `./alert-sink` (`node:20.18-alpine`) | 5001 | Không mở | `1000:1000` (node) | 0.2 CPU / 128 MB | `cinema_monitoring` |

---

## THỐNG KÊ SỐ LIỆU THỰC TẾ TRÊN REPOSITORY

- **Tổng số container hoạt động:** 12/12 container `Up (healthy)`.
- **Tổng số mạng Docker độc lập:** 3 mạng (`cinema_frontend`, `cinema_backend` internal, `cinema_monitoring`).
- **Tổng số Named Volumes:** 6 volumes (`cinema_db_data`, `cinema_web_uploads`, `cinema_pgadmin_data`, `cinema_prometheus_data`, `cinema_grafana_data`, `cinema_loki_data`).
- **Số lượng Commit trong toàn bộ lịch sử Git:** Đúng 3 COMMIT:
  - **Commit 1 (`49944b0`):** 36 tệp thay đổi, 3.486 dòng code (Khởi tạo Web, DB PostgreSQL, pgAdmin, Nginx HTTPS và Security Headers).
  - **Commit 2 (`1860081`):** 9 tệp thay đổi, 958 dòng code (Tích hợp Prometheus, Grafana, cAdvisor, Nginx Exporter, Postgres Exporter).
  - **Commit 3 (`e4b0eaa`):** 21 tệp thay đổi, 1.533 dòng code (Loki, Promtail, Alert-Sink, Grafana Alerting Rule Brute Force, Hardening Non-root, cách ly 3 mạng, Trivy scan).

---

## NỘI DUNG TỪNG CHƯƠNG BÁO CÁO (CHƯƠNG 1 - 6 VÀ KẾT LUẬN)

### CHƯƠNG 1: GIỚI THIỆU ĐỀ TÀI VÀ KIẾN TRÚC TỔNG THỂ HỆ THỐNG
1. **Đoạn mô tả văn phong báo cáo:**
   Đề tài xây dựng một hệ thống đặt vé xem phim và sự kiện trực tuyến hoàn chỉnh, phục vụ đa người dùng từ khách hàng tra cứu, chọn ghế trực quan, đặt vé và nhận vé điện tử kèm mã QR; nhân viên bán vé/soát vé tại rạp; và quản trị viên quản lý danh mục sự kiện, suất chiếu và doanh thu. Toàn bộ hệ thống được đóng gói dạng vi dịch vụ bằng Docker Compose với kiến trúc 12 container chuyên biệt. Hệ thống đảm bảo phân tách rõ ràng giữa tầng Reverse Proxy (Nginx), tầng ứng dụng web (Node.js/Express với Server-Side Rendering EJS), tầng dữ liệu (PostgreSQL và pgAdmin), tầng giám sát hiệu năng (Prometheus, Grafana, Exporters, cAdvisor) và tầng quản trị log tập trung, ứng phó sự cố an toàn thông tin (Loki, Promtail, Alert-Sink).
2. **File cấu hình đáng đưa vào báo cáo:**
   - `docker-compose.yml`: Kiến trúc 12 container, khai báo mạng và volume.
   - `docs/phien-ban.md`: Quản lý phiên bản cố định các image.
3. **File bằng chứng (Evidence):**
   - `evidence/buoc0-moitruong.txt`: Cấu hình môi trường máy tính Windows 11, WSL2 Ubuntu-22.04, Docker version 27.x.
4. **Ảnh cần chụp & Lệnh thực thi:**
   - **Ảnh 1.1:** Trạng thái 12 container hoạt động đồng thời.  
     *Lệnh:* `docker compose ps`
   - **Ảnh 1.2:** Sơ đồ mạng Docker và các volume của dự án.  
     *Lệnh:* `docker network ls && docker volume ls`

---

### CHƯƠNG 2: TRIỂN KHAI DỊCH VỤ WEB, CSDL POSTGRESQL VÀ QUẢN TRỊ PGADMIN
1. **Đoạn mô tả văn phong báo cáo:**
   Hệ thống web được phát triển trên nền Node.js 20 LTS, Express và EJS template engine, tuân thủ nguyên tắc không sử dụng Tailwind CSS mà dùng CSS thuần hiện đại, tối ưu giao diện đặt vé trực quan. Cơ sở dữ liệu sử dụng PostgreSQL 16 Alpine với tệp khởi tạo schema `db/init.sql` tạo sẵn cấu trúc 7 bảng: `users`, `categories`, `events`, `showtimes`, `seats`, `bookings`, `tickets`. Ứng dụng triển khai cơ chế khóa bi quan (SELECT FOR UPDATE) và giao dịch CSDL (Transaction) trong PostgreSQL để giải quyết triệt để bài toán tranh chấp ghế (race condition), đảm bảo không bao giờ xảy ra tình trạng hai khách hàng đặt trùng cùng một ghế tại một thời điểm. Dịch vụ pgAdmin 4 được tích hợp chạy ở chế độ Server Mode độc lập, kết nối nội bộ tới CSDL.
2. **File cấu hình đáng đưa vào báo cáo:**
   - `web/Dockerfile`: Quy trình đóng gói đa bước tối ưu cache, cấu hình user `node`.
   - `db/init.sql`: Cấu trúc DDL, bảng dữ liệu và tài khoản quản trị mẫu.
   - `web/src/controllers/bookingController.js`: Xử lý transaction giữ ghế và thanh toán vé.
3. **File bằng chứng (Evidence):**
   - `evidence/buoc12-web-db.txt`: Kết quả kiểm thử kết nối CSDL, kiểm tra healthcheck và luồng nghiệp vụ ban đầu.
4. **Ảnh cần chụp & Lệnh thực thi:**
   - **Ảnh 2.1:** Giao diện trang chủ danh sách phim và sự kiện trực tuyến qua trình duyệt.
   - **Ảnh 2.2:** Giao diện sơ đồ chọn ghế trực quan (phân loại ghế thường, VIP, đôi và hiển thị ghế đã bán).
   - **Ảnh 2.3:** Giao diện chi tiết vé kèm mã QR sau khi thanh toán thành công.
   - **Ảnh 2.4:** Giao diện quản trị cơ sở dữ liệu pgAdmin tại đường dẫn `/pgadmin/`.

---

### CHƯƠNG 3: NGINX REVERSE PROXY, HTTPS TỰ KÝ VÀ CÁC HEADER AN TOÀN
1. **Đoạn mô tả văn phong báo cáo:**
   Để đảm bảo an toàn truyền thông và kiểm soát truy cập tập trung, Nginx được cấu hình làm Reverse Proxy duy nhất tiếp nhận lưu lượng từ bên ngoài. Toàn bộ kết nối HTTP qua cổng 80 được chuyển hướng 301 tự động sang cổng HTTPS 443. Chứng chỉ SSL/TLS tự ký được tạo tự động qua kịch bản `nginx/gen-cert.sh` với thuật toán RSA 2048-bit, thời hạn 365 ngày và cấu hình Subject Alternative Name (SAN) cho cả `localhost`, `127.0.0.1` và IP mạng LAN. Cấu hình Nginx chỉ cho phép giao thức mã hóa an toàn TLSv1.2 và TLSv1.3, vô hiệu hóa hoàn toàn TLSv1.0 và TLSv1.1 lỗi thời. Đồng thời, Nginx áp dụng toàn diện 7 security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) và ẩn thông tin phiên bản web server (`server_tokens off`).
2. **File cấu hình đáng đưa vào báo cáo:**
   - `nginx/nginx.conf`: Cấu hình upstream, TLS, cipher suites, rate limiting zone và security headers.
   - `nginx/gen-cert.sh`: Kịch bản sinh chứng chỉ X.509 với SAN mở rộng.
3. **File bằng chứng (Evidence):**
   - `evidence/buoc3-nginx.txt`: Kết quả kiểm tra `nginx -t`, chuyển hướng 301, curl headers HTTPS, kiểm tra cổng 3000/5050 bị đóng từ bên ngoài.
4. **Ảnh cần chụp & Lệnh thực thi:**
   - **Ảnh 3.1:** Kết quả kiểm tra cú pháp và nạp cấu hình Nginx.  
     *Lệnh:* `docker compose exec nginx nginx -t`
   - **Ảnh 3.2:** Phản hồi HTTP 301 Redirect sang HTTPS và chi tiết chứng chỉ SSL X.509.  
     *Lệnh:* `curl -sI http://localhost` và `openssl s_client -connect localhost:443 </dev/null`
   - **Ảnh 3.3:** Toàn bộ Security Headers được Nginx đính kèm khi truy cập HTTPS.  
     *Lệnh:* `curl -sk -I https://localhost`

---

### CHƯƠNG 4: HỆ THỐNG GIÁM SÁT PROMETHEUS, GRAFANA VÀ CÁC EXPORTER
1. **Đoạn mô tả văn phong báo cáo:**
   Hệ thống giám sát được triển khai theo mô hình thu thập số liệu time-series qua Prometheus v2.54.1 (retention 7 ngày). Ba exporter chuyên dụng được thiết lập: cAdvisor giám sát chỉ số container (CPU, bộ nhớ, Network I/O), Nginx Prometheus Exporter thu thập trạng thái web server qua `/nginx_status`, và Postgres Exporter theo dõi hiệu năng CSDL qua tài khoản chuyên dụng `exporter` có quyền `pg_monitor`. Grafana v11.2 được tích hợp qua Nginx reverse proxy tại đường dẫn `/grafana/`, nạp tự động (Provisioning) 3 dashboard chuyên nghiệp: `Cinema - Containers`, `Cinema - Nginx`, và `Cinema - PostgreSQL`. Mọi cổng dịch vụ giám sát (9090, 8080, 9113, 9187) đều được bảo vệ trong mạng nội bộ, ngăn chặn truy cập trực tiếp từ máy chủ vật lý.
2. **File cấu hình đáng đưa vào báo cáo:**
   - `prometheus/prometheus.yml`: Cấu hình scrape targets, scrape_interval 10s.
   - `grafana/provisioning/datasources/datasources.yml`: Nạp tự động Prometheus và Loki datasource.
   - `grafana/dashboards/`: Các tệp định nghĩa JSON của 3 dashboards hệ thống.
3. **File bằng chứng (Evidence):**
   - `evidence/buoc4-giamsat.txt`: Trạng thái các targets UP trong Prometheus, API health của Grafana và Exporter metrics.
4. **Ảnh cần chụp & Lệnh thực thi:**
   - **Ảnh 4.1:** Giao diện Dashboard `Cinema - Containers` hiển thị biểu đồ CPU, RAM của 12 container.
   - **Ảnh 4.2:** Giao diện Dashboard `Cinema - Nginx` hiển thị tỉ lệ request, trạng thái kết nối HTTP.
   - **Ảnh 4.3:** Giao diện Dashboard `Cinema - PostgreSQL` hiển thị số transaction, kết nối và locks CSDL.
   - **Ảnh 4.4:** Kiểm tra targets Prometheus đều ở trạng thái UP (1/1).  
     *Lệnh:* Tạo override tạm thời truy cập `http://localhost:9090/targets` như hướng dẫn trong README.

---

### CHƯƠNG 5: QUẢN LÝ LOG TẬP TRUNG LOKI/PROMTAIL VÀ XỬ LÝ SỰ CỐ AN TOÀN THÔNG TIN
1. **Đoạn mô tả văn phong báo cáo:**
   Hạ tầng log tập trung sử dụng Grafana Loki v3.1.1 kết hợp Promtail v3.1.1 thu thập log container trực tiếp qua Docker socket. Các nhãn log được chuẩn hóa nghiêm ngặt (`job="webapp"`, `job="nginx"`, `job="postgres"`, `job="alert-sink"`). Dashboard `Cinema - Logs` gồm 8 panel trực quan hóa số lượng log, mã lỗi HTTP và truy vấn log chi tiết. Để kiểm chứng khả năng ứng phó sự cố, kịch bản tấn công dò quét mật khẩu (Brute Force) vào `/login` với 20 request sai liên tiếp được thực hiện qua kịch bản `scripts/simulate_bruteforce.sh`. Hệ thống đã chứng minh năng lực phòng thủ 3 lớp:
   - **Lớp 1 (Nginx Rate Limiting):** Chặn đứng 17 request với mã `HTTP 429 Too Many Requests`.
   - **Lớp 2 (Truy vết LogQL):** Ghi nhận chính xác các sự kiện `LOGIN_FAILED ip=... user=admin reason=wrong_password`.
   - **Lớp 3 (Grafana Alerting & Webhook):** Cảnh báo `Cinema - Brute force login` chuyển trạng thái `FIRING` sau khi vượt ngưỡng > 5 lỗi/phút và tự động bắn Webhook thông báo tới dịch vụ `alert-sink`.
2. **File cấu hình đáng đưa vào báo cáo:**
   - `loki/loki-config.yaml`: Cấu hình storage filesystem, retention 7 ngày.
   - `promtail/promtail-config.yaml`: Docker service discovery và quy tắc gán nhãn relabel_configs.
   - `grafana/provisioning/alerting/alerting.yml`: Định nghĩa rule cảnh báo Brute Force và contact point webhook.
   - `scripts/simulate_bruteforce.sh`: Kịch bản mô phỏng tấn công an toàn thông tin.
   - `docs/su-co-bruteforce.md`: Hồ sơ điều tra sự cố chuẩn mẫu.
3. **File bằng chứng (Evidence):**
   - `evidence/buoc5-logql.txt`: Kết quả thực thi 6 câu truy vấn LogQL chuẩn xác.
   - `evidence/buoc5-sucodo.txt`: Toàn bộ log dòng thời gian sự cố từ lúc bình thường, bị tấn công, Alert firing, webhook tiếp nhận, và khách hàng đăng nhập hợp lệ bình thường.
4. **Ảnh cần chụp & Lệnh thực thi:**
   - **Ảnh 5.1:** Dashboard `Cinema - Logs` hiển thị biểu đồ phân bổ log và log stream của ứng dụng web.
   - **Ảnh 5.2:** Trạng thái Alert Rule `Cinema - Brute force login` chuyển sang màu đỏ `Firing` trong giao diện Grafana Alerting.
   - **Ảnh 5.3:** Log tiếp nhận Webhook cảnh báo của container `cinema_alert_sink`.  
     *Lệnh:* `docker compose logs alert-sink`
   - **Ảnh 5.4:** Kết quả truy vấn LogQL truy vết sự cố trong Grafana Explore: `{job="webapp"} |= "LOGIN_FAILED"`.

---

### CHƯƠNG 6: GIA CỐ BẢO MẬT (HARDENING) VÀ QUÉT LỖ HỔNG BẰNG TRIVY
1. **Đoạn mô tả văn phong báo cáo:**
   Hệ thống áp dụng toàn diện 8 biện pháp gia cố bảo mật chuyên sâu:
   - **Non-root containers:** Tất cả container ứng dụng chạy dưới UID không đặc quyền (`nginx`: 101, `web`: 1000, `db`: 70, `prometheus`: 65534, `grafana`: 472, `loki`: 10001, `alert-sink`: 1000). Hai dịch vụ bắt buộc quyền root (`cadvisor`, `promtail`) được giải trình rõ ràng và bảo vệ nghiêm ngặt bằng mount `:ro` và `cap_drop`.
   - **Network Isolation:** 3 mạng Docker bridge độc lập; CSDL nằm trong mạng `cinema_backend` có `internal: true`, không publish cổng.
   - **Least Privilege CSDL:** Role `cinema_app` chỉ có quyền `SELECT, INSERT, UPDATE, DELETE`, không superuser; hành vi tấn công `DROP TABLE` bị PostgreSQL chặn đứng.
   - **Container Constraints:** Bật `no-new-privileges:true`, tước bỏ toàn bộ Capabilities `cap_drop: [ALL]`, giới hạn RAM và CPU vừa phải.
   - **Tường lửa Windows:** Phân tích hạn chế Docker Desktop trên WSL2 và cung cấp bộ quy tắc Windows Defender Firewall chỉ mở cổng 80 và 443.
   - **Quét Trivy:** Công cụ `aquasec/trivy:0.56.2` quét toàn diện image; bước `RUN apk update && apk upgrade --no-cache` trong Dockerfile đã triệt tiêu **100% (21/21) lỗ hổng hệ điều hành Alpine (0 CRITICAL, 0 HIGH)** trong image tự xây dựng.
2. **File cấu hình đáng đưa vào báo cáo:**
   - `web/Dockerfile`: Lệnh `apk upgrade`, cấu hình user `node`, quyền thư mục uploads.
   - `docker-compose.yml`: Cấu hình 3 mạng, `user:`, `security_opt:`, `cap_drop:`, `deploy.resources.limits`.
   - `evidence/buoc6-trivy.txt`: Báo cáo kết quả quét và remediations.
   - `evidence/buoc6-hardening.txt`: Bằng chứng kiểm chứng UID, phân quyền DB, headers, smoke test.
   - `evidence/final-smoke-test.txt`: Bằng chứng kiểm thử "chạy bằng một lệnh" từ trạng thái sạch.
3. **File bằng chứng (Evidence):**
   - `evidence/buoc6-hardening.txt`
   - `evidence/buoc6-trivy.txt`
   - `evidence/final-smoke-test.txt`
4. **Ảnh cần chụp & Lệnh thực thi:**
   - **Ảnh 6.1:** Kiểm tra UID/GID của các container chứng minh non-root.  
     *Lệnh:* `docker compose exec <service> id`
   - **Ảnh 6.2:** Kiểm tra CSDL từ chối lệnh xóa bảng của tài khoản `cinema_app`.  
     *Lệnh:* `docker compose exec -T db psql -U cinema_app -d cinemadb -c 'DROP TABLE users;'`
   - **Ảnh 6.3:** Kiểm tra chỉ có cổng 80 và 443 lắng nghe trên máy chủ Windows.  
     *Lệnh PowerShell:* `Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 80,443,3000,5050,9090`
   - **Ảnh 6.4:** Báo cáo quét Trivy cho image `cinema-web:latest` đạt 0 CRITICAL, 0 HIGH ở tầng Alpine OS.  
     *Lệnh:* `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock:ro aquasec/trivy:0.56.2 image --severity HIGH,CRITICAL cinema-web:latest`

---

### KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN
1. **Đoạn mô tả văn phong báo cáo:**
   Đề tài đã hoàn thành xuất sắc toàn bộ các mục tiêu đặt ra với chất lượng kỹ thuật cao. Một hệ thống đặt vé xem phim và sự kiện quy mô vi dịch vụ 12 container đã được triển khai, vận hành ổn định và bảo mật toàn diện trên nền tảng Docker Compose. Dự án minh chứng đầy đủ năng lực tích hợp DevOps: từ đóng gói ứng dụng, bảo vệ đường truyền HTTPS, tự động hóa giám sát số liệu và log tập trung, thiết lập quy trình ứng phó sự cố an toàn thông tin theo thời gian thực, đến việc gia cố bảo mật đa tầng đạt chuẩn công nghiệp.
2. **Hướng phát triển tiếp theo:**
   - Nâng cấp mở rộng cụm container bằng Docker Swarm hoặc Kubernetes (K8s) với cơ chế tự động co giãn (Horizontal Pod Autoscaler).
   - Tích hợp cổng thanh toán thực tế (VNPAY Sandbox / MoMo API) và dịch vụ gửi vé điện tử qua Email (SendGrid / Nodemailer).
   - Thiết lập quy trình CI/CD hoàn chỉnh (GitHub Actions / GitLab CI) tự động quét mã nguồn tĩnh (SAST), quét container image bằng Trivy trước khi đẩy lên Docker Registry.
