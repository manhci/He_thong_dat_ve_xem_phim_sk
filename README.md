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

## 3. Hướng dẫn khởi động nhanh
```bash
# Khởi động toàn bộ hệ thống
docker compose up -d --build

# Kiểm tra trạng thái các container
docker compose ps
```

---

## 4. Kiến trúc và Cổng dịch vụ
- **Web App (HTTPS):** `https://localhost` (Nginx chuyển tiếp đến web container)
- **pgAdmin (Quản trị CSDL):** `https://localhost/pgadmin/` (Nginx chuyển tiếp đến pgadmin container)
- **Cổng 80 (HTTP):** Tự động chuyển hướng 301 sang HTTPS (Port 443).
- **Các cổng ứng dụng (3000, 5050, 5432):** Được cô lập hoàn toàn bên trong mạng nội bộ Docker, không publish ra ngoài host.

> [!NOTE]
> Khi truy cập qua trình duyệt Windows, do sử dụng chứng chỉ SSL tự ký (Self-Signed), trình duyệt sẽ hiện cảnh báo bảo mật. Bạn chỉ cần chọn **Nâng cao (Advanced)** -> **Tiếp tục truy cập localhost (Proceed to localhost)**.
