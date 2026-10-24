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
