# DTC245180048-cinema-devops

> **Học phần:** Triển khai và Quản trị Hệ thống Phần mềm  
> **Sinh viên:** Đoàn Ngọc Mạnh  
> **MSSV:** DTC245180048  
> **Đề tài:** Hệ thống Đặt vé Xem phim / Sự kiện (Cinema & Event Ticket Booking System)

---

## 1. Giới thiệu tổng quan
Hệ thống đặt vé xem phim và sự kiện trực tuyến được đóng gói hoàn toàn bằng Docker Compose bao gồm 12 container dịch vụ:
- **nginx**: Reverse proxy phục vụ HTTPS (SSL tự ký) và áp dụng security headers.
- **web**: Ứng dụng Node.js (Express + EJS SSR + CSS thuần).
- **db**: CSDL PostgreSQL lưu trữ dữ liệu nghiệp vụ.
- **pgadmin**: Giao diện quản lý CSDL PostgreSQL.
- **prometheus**: Thu thập và lưu trữ time-series metrics.
- **grafana**: Dashboard trực quan hóa giám sát hệ thống và ứng dụng.
- **cadvisor**: Giám sát tài nguyên container.
- **nginx-exporter**: Thu thập metrics từ Nginx.
- **postgres-exporter**: Thu thập metrics từ PostgreSQL.
- **loki**: Hệ thống lưu trữ và quản lý log tập trung.
- **promtail**: Thu thập và chuyển tiếp log container đến Loki.
- **alert-sink**: Tiếp nhận và xử lý cảnh báo sự cố an toàn thông tin.

---

## 2. Hướng dẫn khởi tạo và sinh chứng chỉ SSL

Trước khi khởi động hệ thống lần đầu, sinh chứng chỉ SSL tự ký bằng lệnh:
```bash
# Trong môi trường WSL2 tại thư mục dự án (~/cinema):
chmod +x nginx/gen-cert.sh
./nginx/gen-cert.sh [IP_LAN_tùy_chọn]
```
Chứng chỉ `server.crt` và khóa bí mật `server.key` sẽ được tự động sinh tại thư mục `nginx/certs/` (đã được cấu hình trong `.gitignore` để không bị lộ lên mã nguồn).

---

## 3. Khởi tạo người dùng Exporter cho CSDL PostgreSQL

Đối với trường hợp volume CSDL PostgreSQL đã tồn tại từ trước, tạo người dùng `exporter` an toàn bằng lệnh:
```bash
docker compose exec db psql -U cinema_app -d cinemadb -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'exporter') THEN
    CREATE ROLE exporter LOGIN PASSWORD 'ExporterCinema@2026!Key';
  END IF;
END
\$\$;
GRANT pg_monitor TO exporter;
"
```

---

## 4. Hướng dẫn khởi động hệ thống
```bash
# Khởi động toàn bộ các dịch vụ
docker compose up -d

# Kiểm tra trạng thái các container
docker compose ps
```

---

## 5. Kiến trúc Cổng và Đường dẫn Dịch vụ
- **Web App (HTTPS):** `https://localhost` (Nginx chuyển tiếp đến web container)
- **pgAdmin (Quản trị CSDL):** `https://localhost/pgadmin/` (Nginx chuyển tiếp đến pgadmin container)
- **Grafana Monitoring:** `https://localhost/grafana/` (Nginx chuyển tiếp đến grafana container)
- **Cổng 80 (HTTP):** Tự động chuyển hướng 301 sang HTTPS (Port 443).
- **Các cổng dịch vụ nội bộ (3000, 5050, 5432, 8080, 9090, 9113, 9187):** Được cô lập hoàn toàn trong mạng Docker, không publish ra ngoài host.

---

## 6. Hướng dẫn kiểm tra Prometheus Targets trực tiếp (Tùy chọn cho Báo cáo)

Để truy cập giao diện Prometheus Targets tại `http://localhost:9090/targets` mà không vi phạm nguyên tắc bảo mật (không commit cấu hình mở cổng):
1. Tạo tệp `docker-compose.override.yml` (đã nằm trong `.gitignore`):
   ```yaml
   services:
     prometheus:
       ports:
         - "127.0.0.1:9090:9090"
   ```
2. Cập nhật container Prometheus: `docker compose up -d prometheus`
3. Mở trình duyệt truy cập: `http://localhost:9090/targets` để chụp ảnh báo cáo.
4. Xóa tệp `docker-compose.override.yml` và chạy lại `docker compose up -d` để đóng cổng.

---

## 7. Cấu hình Hardening Bảo mật & Cơ chế Non-Root Container

Hệ thống được thiết kế theo nguyên tắc đặc quyền tối thiểu (**Principle of Least Privilege**) và phòng thủ chuyên sâu (**Defense in Depth**):

### 7.1. Phân quyền Người dùng Không đặc quyền (Non-Root)
- **cinema_web:** Chạy dưới người dùng `node` (UID: 1000, GID: 1000). Thư mục `/app/public/uploads` được cấp quyền ghi tối thiểu cho user `node`.
- **cinema_nginx:** Sử dụng base image `nginxinc/nginx-unprivileged:1.27.1-alpine`, chạy dưới user `nginx` (UID: 101, GID: 101), lắng nghe trên cổng không đặc quyền 8080 và 8443 (được map ra host 80:8080 và 443:8443).
- **cinema_db:** Chạy dưới user `postgres` (UID: 70, GID: 70). Tài khoản ứng dụng `cinema_app` chỉ được cấp quyền `SELECT, INSERT, UPDATE, DELETE` trên các bảng cần thiết, không có quyền superuser, không thể `CREATE` hay `DROP TABLE`.
- **cinema_prometheus:** Chạy dưới user `nobody` (UID: 65534, GID: 65534).
- **cinema_grafana:** Chạy dưới user `grafana` (UID: 472, GID: 472).
- **cinema_loki:** Chạy dưới user `loki` (UID: 10001, GID: 10001).
- **cinema_alert_sink:** Chạy dưới user `node` (UID: 1000, GID: 1000).
- **cinema_nginx_exporter / cinema_postgres_exporter:** Chạy dưới user `nobody` (UID: 65534).

### 7.2. Các Dịch vụ Bắt buộc Quyền Root (Có giải trình kỹ thuật)
- **cinema_cadvisor:**
  - *Lý do kỹ thuật:* cAdvisor cần quyền root để truy cập trực tiếp vào hệ thống tệp cgroups ảo `/sys/fs/cgroup`, `/sys`, `/var/run` và docker daemon của máy ảo Docker Desktop nhằm đo lường số liệu CPU, RAM, Network I/O của toàn bộ các container.
  - *Biện pháp hạn chế rủi ro:* Mount tất cả các thư mục hệ thống ở chế độ chỉ đọc (`:ro`), bật `security_opt: [no-new-privileges:true]`, giới hạn tài nguyên CPU và RAM.
- **cinema_promtail:**
  - *Lý do kỹ thuật:* Promtail cần đọc trực tiếp tệp socket Unix `/var/run/docker.sock` (thuộc quyền sở hữu của `root:root` trên Docker daemon) để tự động phát hiện container và stream log tập trung về Loki.
  - *Biện pháp hạn chế rủi ro:* Mount `/var/run/docker.sock` ở chế độ chỉ đọc (`:ro`), cấu hình `security_opt: [no-new-privileges:true]`, cô lập hoàn toàn trong mạng `cinema_monitoring`.

### 7.3. Cách ly Mạng (Network Isolation)
Hệ thống phân tách thành 3 mạng Docker bridge độc lập:
1. `cinema_frontend`: Kết nối giữa `nginx`, `web`, `pgadmin`, `grafana`.
2. `cinema_backend` (`internal: true`): Kết nối `web`, `db`, `pgadmin`, `postgres-exporter`. Hoàn toàn không có gateway ra ngoài Internet, ngăn chặn mọi truy cập từ bên ngoài tới CSDL.
3. `cinema_monitoring`: Kết nối `prometheus`, `grafana`, `cadvisor`, `nginx-exporter`, `postgres-exporter`, `loki`, `promtail`, `alert-sink`.

---

## 8. Hướng dẫn Tường lửa Windows (Windows Defender Firewall)

> **Lưu ý quan trọng về Docker Desktop & WSL2:**
> Trên môi trường Windows với Docker Desktop (WSL2 backend), công cụ tường lửa Linux (UFW) bên trong WSL không thể kiểm soát được lưu lượng gửi tới các cổng được Docker publish. Nguyên nhân do Docker Desktop sử dụng tiến trình proxy `com.docker.backend.exe` / `wsl-relay` chạy trực tiếp trên Windows để forward cổng. Vì vậy, tường lửa phải được thiết lập tại **Windows Defender Firewall**.

### 8.1. Kiểm tra Cổng Lắng nghe & Quy tắc Hiện tại
Mở PowerShell (quyền người dùng thông thường):
```powershell
# 1. Kiểm tra các cổng đang lắng nghe của dự án (Chỉ 80 và 443 được mở)
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 80,443,3000,5050,5432,9090 | Format-Table -AutoSize

# 2. Kiểm tra quy tắc tường lửa liên quan đến Docker
netsh advfirewall firewall show rule name=all | findstr /i docker
```

### 8.2. Thiết lập Quy tắc Tường lửa Windows (Dành cho Quản trị viên)
Để gia cố an ninh, chỉ cho phép kết nối đến cổng 80 và 443 của dự án, người dùng có thể mở **PowerShell với quyền Administrator** và chạy các lệnh sau:
```powershell
# 1. Tạo quy tắc cho phép truy cập cổng HTTP (80)
New-NetFirewallRule -DisplayName "Cinema System - HTTP Inbound (Port 80)" `
  -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow `
  -Description "Cho phep truy cap dich vu Cinema HTTP qua Nginx Reverse Proxy"

# 2. Tạo quy tắc cho phép truy cập cổng HTTPS (443)
New-NetFirewallRule -DisplayName "Cinema System - HTTPS Inbound (Port 443)" `
  -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow `
  -Description "Cho phep truy cap dich vu Cinema HTTPS an toan qua Nginx Reverse Proxy"

# 3. Tạo quy tắc chặn các cổng nội bộ dự án nếu có tiến trình publish ngoài ý muốn
New-NetFirewallRule -DisplayName "Cinema System - Block Internal Ports" `
  -Direction Inbound -LocalPort 3000,5050,5432,8080,9090,3100,5001,9187 -Protocol TCP -Action Block `
  -Description "Chan truy cap tu ngoai vao cac cong noi bo cua du an Cinema"
```

*Phương án bổ sung (Giới hạn truy cập cục bộ):* Nếu chỉ có nhu cầu sử dụng ứng dụng trên chính máy Windows hiện tại, có thể sửa cổng publish trong `docker-compose.yml` thành `127.0.0.1:80:8080` và `127.0.0.1:443:8443` để từ chối mọi kết nối từ các máy tính khác trong mạng LAN.

---

## 9. Quét Lỗ hổng Bảo mật Container Image (Trivy Scan)

Quét lỗ hổng được thực hiện bằng công cụ `aquasec/trivy:0.56.2`:
- Lệnh quét:
  ```bash
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock:ro aquasec/trivy:0.56.2 image --severity HIGH,CRITICAL <tên_image>
  ```
- **Kết quả xử lý:**
  - Hai image tự xây dựng (`cinema-web:latest` và `cinema-alert-sink:latest`) đã được cập nhật `RUN apk update && apk upgrade --no-cache`, khắc phục thành công **100% các lỗ hổng hệ điều hành Alpine (0 CRITICAL, 0 HIGH)**.
  - Các lỗ hổng còn tồn tại trong image upstream (Go runtime trong Prometheus/Grafana) được bảo vệ bằng cơ chế phòng thủ chuyên sâu: Non-root user, `cap_drop: [ALL]`, `no-new-privileges:true`, và cách ly mạng nội bộ.
- Báo cáo chi tiết được lưu tại tệp `evidence/buoc6-trivy.txt`.
