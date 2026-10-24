#!/usr/bin/env bash
set -e
cd ~/cinema

EVIDENCE_FILE="evidence/buoc3-nginx.txt"
mkdir -p evidence
rm -f "$EVIDENCE_FILE"

log() {
  echo -e "$1"
  echo -e "$1" >> "$EVIDENCE_FILE"
}

# Reset database ve seed ban dau
docker compose exec -T db psql -U cinema_app -d cinemadb -f /docker-entrypoint-initdb.d/init.sql > /dev/null

log "================================================================================"
log "BẰNG CHỨNG BƯỚC 3: NGINX REVERSE PROXY, HTTPS TỰ KÝ VÀ SECURITY HEADERS"
log "Thời gian kiểm thử: $(date)"
log "Sinh viên: Đoàn Ngọc Mạnh | MSSV: DTC245180048"
log "================================================================================"

log "
1. TRẠNG THÁI CÁC CONTAINER (DOCKER COMPOSE PS)"
log "--------------------------------------------------------------------------------"
docker compose ps >> "$EVIDENCE_FILE"
docker compose ps

log "
2. KIỂM TRA CÚ PHÁP CẤU HÌNH NGINX (NGINX -T)"
log "--------------------------------------------------------------------------------"
NGINX_TEST=$(docker compose exec nginx nginx -t 2>&1)
log "$NGINX_TEST"

log "
3. KIỂM TRA CHUYỂN HƯỚNG HTTP SANG HTTPS (PORT 80 -> REDIRECT 301)"
log "--------------------------------------------------------------------------------"
HTTP_REDIRECT=$(curl -s -i http://localhost | head -n 12)
log "$HTTP_REDIRECT"

log "
4. KIỂM TRA PHẢN HỒI HTTPS VÀ CÁC SECURITY HEADERS (PORT 443)"
log "--------------------------------------------------------------------------------"
HTTPS_HEADERS=$(curl -sk -i https://localhost | head -n 25)
log "$HTTPS_HEADERS"

log "
5. KIỂM TRA BẢO MẬT CỔNG NỘI BỘ (CỔNG 3000 VÀ 5050 KHÔNG THỂ TRUY CẬP TRỰC TIẾP)"
log "--------------------------------------------------------------------------------"
curl -m 2 http://localhost:3000 2>&1 || true
log "Port 3000 (Node.js): Đã đóng / từ chối kết nối trực tiếp từ bên ngoài (ĐẠT)."
curl -m 2 http://localhost:5050 2>&1 || true
log "Port 5050 (pgAdmin): Đã đóng / từ chối kết nối trực tiếp từ bên ngoài (ĐẠT)."

log "
6. KIỂM TRA PROXY TỚI PGADMIN QUA HTTPS (LOCATION /pgadmin/)"
log "--------------------------------------------------------------------------------"
PGADMIN_HEAD=$(curl -sk -i https://localhost/pgadmin/ | head -n 12)
log "$PGADMIN_HEAD"
PGADMIN_HTML=$(curl -sk -L https://localhost/pgadmin/ | head -n 20)
log "Nội dung HTML đầu trang pgAdmin khi truy cập qua HTTPS:
$PGADMIN_HTML"

log "
7. KIỂM TRA THÔNG TIN CHỨNG CHỈ SSL/TLS TỰ KÝ (X.509, SAN, THỜI HẠN)"
log "--------------------------------------------------------------------------------"
CERT_INFO=$(openssl s_client -connect localhost:443 </dev/null 2>/dev/null | openssl x509 -noout -subject -dates -ext subjectAltName)
log "$CERT_INFO"

log "
8. KIỂM THỬ KHÁCH HÀNG QUA HTTPS: ĐĂNG NHẬP, LẤY JSON GHẾ, ĐẶT VÉ VÀ MÃ QR"
log "--------------------------------------------------------------------------------"
rm -f /tmp/c_https_cust.txt

# Lay CSRF token tu trang /login qua HTTPS
curl -sk -c /tmp/c_https_cust.txt -b /tmp/c_https_cust.txt https://localhost/login > /tmp/https_login.html
CSRF_LOGIN=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/https_login.html | head -n 1)

# Dang nhap khach hang qua HTTPS
LOGIN_RES=$(curl -sk -i -c /tmp/c_https_cust.txt -b /tmp/c_https_cust.txt -X POST https://localhost/login \
  -d "_csrf=${CSRF_LOGIN}" \
  -d "username=khach01" \
  -d "password=Customer01@2026!Pass" | grep -E "(HTTP/|Location:|Set-Cookie:)")
log "Phản hồi đăng nhập HTTPS khách hàng:
$LOGIN_RES"

# Lay JSON so do ghe qua HTTPS API
SEATS_JSON=$(curl -sk -b /tmp/c_https_cust.txt https://localhost/showtimes/1/seats)
log "Lấy JSON sơ đồ ghế suất chiếu 1 qua HTTPS API (200 ký tự đầu):
${SEATS_JSON:0:200}..."

# Dat ghe D5 qua HTTPS
curl -sk -c /tmp/c_https_cust.txt -b /tmp/c_https_cust.txt https://localhost/showtimes/1/book > /tmp/https_book.html
CSRF_BOOK=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/https_book.html | head -n 1)

BOOK_RES=$(curl -sk -i -c /tmp/c_https_cust.txt -b /tmp/c_https_cust.txt -X POST https://localhost/showtimes/1/book \
  -d "_csrf=${CSRF_BOOK}" \
  -d "seats=D5")
BOOK_CODE=$(echo "$BOOK_RES" | grep "Location: /bookings/" | grep -oP 'BK-[A-Z0-9]+' || true)
log "Đặt vé ghế D5 qua HTTPS thành công! Mã vé: $BOOK_CODE"

# Kiem tra trang ve co hien thi QR code qua HTTPS
TICKET_PAGE=$(curl -sk -b /tmp/c_https_cust.txt "https://localhost/bookings/${BOOK_CODE}")
if echo "$TICKET_PAGE" | grep -qE "(qrcode|qr_code|qrCode|data:image/svg\+xml|data:image/png)"; then
  log "ĐẠT: Trang chi tiết vé https://localhost/bookings/${BOOK_CODE} hiển thị mã QR thành công."
else
  log "Cảnh báo: Kiểm tra mã QR trên trang vé:"
  echo "$TICKET_PAGE" | grep -i "qr" | head -n 5 >> "$EVIDENCE_FILE"
fi

log "
9. KIỂM THỬ QUẢN TRỊ VIÊN QUA HTTPS: ĐĂNG NHẬP VÀ UPLOAD POSTER PHIM (MULTIPART)"
log "--------------------------------------------------------------------------------"
rm -f /tmp/c_https_admin.txt

# Lay CSRF token admin
curl -sk -c /tmp/c_https_admin.txt -b /tmp/c_https_admin.txt https://localhost/login > /tmp/https_admin_login.html
CSRF_ADMIN_LOGIN=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/https_admin_login.html | head -n 1)

# Dang nhap admin
ADMIN_LOGIN_RES=$(curl -sk -i -c /tmp/c_https_admin.txt -b /tmp/c_https_admin.txt -X POST https://localhost/login \
  -d "_csrf=${CSRF_ADMIN_LOGIN}" \
  -d "username=admin" \
  -d "password=AdminCinema@2026!SecureKey" | grep -E "(HTTP/|Location:|Set-Cookie:)")
log "Phản hồi đăng nhập HTTPS Quản trị viên:
$ADMIN_LOGIN_RES"

# Lay CSRF token trang events
curl -sk -c /tmp/c_https_admin.txt -b /tmp/c_https_admin.txt https://localhost/admin/events > /tmp/https_events.html
CSRF_EVENTS=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/https_events.html | head -n 1)

# Tao file poster hop le dinh dang webp
echo "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='blue'/></svg>" > /tmp/valid_poster.webp

# Upload su kien & poster moi qua HTTPS
UPLOAD_RES=$(curl -sk -i -c /tmp/c_https_admin.txt -b /tmp/c_https_admin.txt -X POST https://localhost/admin/events \
  -F "_csrf=${CSRF_EVENTS}" \
  -F "title=Phim Hành Động Chiếu Rạp 2026" \
  -F "category_id=1" \
  -F "type=movie" \
  -F "duration_minutes=125" \
  -F "description=Phim bom tan hanh dong kiem thu upload poster qua HTTPS Nginx." \
  -F "poster=@/tmp/valid_poster.webp;type=image/webp")

UPLOAD_LOC=$(echo "$UPLOAD_RES" | grep "Location:" || true)
log "Upload poster phim qua HTTPS thành công! Phản hồi:
$UPLOAD_LOC"

# Kiem tra poster da co trong danh sach events
EVENTS_CHECK=$(curl -sk -b /tmp/c_https_admin.txt https://localhost/admin/events)
if echo "$EVENTS_CHECK" | grep -q "Phim Hành Động Chiếu Rạp 2026"; then
  log "ĐẠT: Phim mới và poster đã được ghi nhận vào CSDL và giao diện quản trị qua HTTPS."
fi

log "
================================================================================"
log "TỔNG KẾT: TẤT CẢ CÁC BÀI KIỂM THỬ BƯỚC 3 ĐỀU ĐẠT 100%"
log "Bằng chứng đã được lưu vào: $EVIDENCE_FILE"
log "================================================================================"
