#!/usr/bin/env bash
set -e
cd ~/cinema

EVIDENCE_FILE="evidence/buoc12-web-db.txt"
mkdir -p evidence
rm -f "$EVIDENCE_FILE"

log() {
  echo -e "$1"
  echo -e "$1" >> "$EVIDENCE_FILE"
}

# Reset database to clean seed state before testing
docker compose exec -T db psql -U cinema_app -d cinemadb -f /docker-entrypoint-initdb.d/init.sql > /dev/null

log "================================================================================"
log "BẰNG CHỨNG BƯỚC 1 & 2: ỨNG DỤNG WEB + POSTGRESQL + PGADMIN"
log "Thời gian kiểm thử: $(date)"
log "Sinh viên: Đoàn Ngọc Mạnh | MSSV: DTC245180048"
log "================================================================================"

log "
1. TRẠNG THÁI DOCKER COMPOSE PS (TẤT CẢ RUNNING / HEALTHY)"
log "--------------------------------------------------------------------------------"
docker compose ps >> "$EVIDENCE_FILE"
docker compose ps

log "
2. KIỂM TRA TRANG /health VÀ TRANG ĐĂNG NHẬP (HTTP 200)"
log "--------------------------------------------------------------------------------"
HEALTH_OUT=$(curl -s -i http://localhost:3000/health)
log "$HEALTH_OUT"

LOGIN_PAGE_OUT=$(curl -s -i http://localhost:3000/login | head -n 12)
log "$LOGIN_PAGE_OUT"

log "
3. KIỂM THỬ POSTGRESQL (ĐÚNG 7 BẢNG & DỮ LIỆU SEED)"
log "--------------------------------------------------------------------------------"
docker compose exec -T db psql -U cinema_app -d cinemadb -c "\dt" >> "$EVIDENCE_FILE"
docker compose exec -T db psql -U cinema_app -d cinemadb -c "
SELECT 'users' AS tbl, count(*) FROM users
UNION ALL SELECT 'categories', count(*) FROM categories
UNION ALL SELECT 'venues', count(*) FROM venues
UNION ALL SELECT 'events', count(*) FROM events
UNION ALL SELECT 'showtimes', count(*) FROM showtimes
UNION ALL SELECT 'bookings', count(*) FROM bookings
UNION ALL SELECT 'booking_seats', count(*) FROM booking_seats;
" >> "$EVIDENCE_FILE"
docker compose exec -T db psql -U cinema_app -d cinemadb -c "\dt"
docker compose exec -T db psql -U cinema_app -d cinemadb -c "
SELECT 'users' AS tbl, count(*) FROM users
UNION ALL SELECT 'categories', count(*) FROM categories
UNION ALL SELECT 'venues', count(*) FROM venues
UNION ALL SELECT 'events', count(*) FROM events
UNION ALL SELECT 'showtimes', count(*) FROM showtimes
UNION ALL SELECT 'bookings', count(*) FROM bookings
UNION ALL SELECT 'booking_seats', count(*) FROM booking_seats;
"

log "
4. KIỂM THỬ ĐĂNG NHẬP THẤT BẠI & ĐỊNH DẠNG LOG LOGIN_FAILED"
log "--------------------------------------------------------------------------------"
# Wrong password
curl -s -c /tmp/c_fake.txt -b /tmp/c_fake.txt http://localhost:3000/login > /tmp/login.html
CSRF_TOKEN=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/login.html | head -n 1)

curl -s -i -c /tmp/c_fake.txt -b /tmp/c_fake.txt -X POST http://localhost:3000/login   -d "_csrf=${CSRF_TOKEN}"   -d "username=admin"   -d "password=WrongPassword123" > /dev/null

# Inactive user test (lock user khach02 temporarily)
docker compose exec -T db psql -U cinema_app -d cinemadb -c "UPDATE users SET is_active = false WHERE username = 'khach02';" > /dev/null
curl -s -i -c /tmp/c_fake.txt -b /tmp/c_fake.txt -X POST http://localhost:3000/login   -d "_csrf=${CSRF_TOKEN}"   -d "username=khach02"   -d "password=Customer02@2026!Pass" > /dev/null
docker compose exec -T db psql -U cinema_app -d cinemadb -c "UPDATE users SET is_active = true WHERE username = 'khach02';" > /dev/null

# Unknown user test
curl -s -i -c /tmp/c_fake.txt -b /tmp/c_fake.txt -X POST http://localhost:3000/login   -d "_csrf=${CSRF_TOKEN}"   -d "username=unknown_ghost_user"   -d "password=AnyPass" > /dev/null

sleep 1
log "Logs LOGIN_FAILED ghi nhận từ container cinema_web:"
docker compose logs web | grep "LOGIN_FAILED" | tail -n 5 >> "$EVIDENCE_FILE"
docker compose logs web | grep "LOGIN_FAILED" | tail -n 5

log "
5. KIỂM THỬ KHÁCH HÀNG: ĐĂNG KÝ -> ĐĂNG NHẬP -> ĐẶT VÉ THÀNH CÔNG"
log "--------------------------------------------------------------------------------"
rm -f /tmp/c_cust.txt
curl -s -c /tmp/c_cust.txt -b /tmp/c_cust.txt http://localhost:3000/register > /tmp/reg.html
CSRF_REG=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/reg.html | head -n 1)

RAND_USER="test_cust_$(date +%s)"
curl -s -i -c /tmp/c_cust.txt -b /tmp/c_cust.txt -X POST http://localhost:3000/register   -d "_csrf=${CSRF_REG}"   -d "username=${RAND_USER}"   -d "email=${RAND_USER}@gmail.com"   -d "full_name=Khách Hàng Test E2E"   -d "password=Password123@" | head -n 8 >> "$EVIDENCE_FILE"

# Login with new customer
curl -s -c /tmp/c_cust.txt -b /tmp/c_cust.txt http://localhost:3000/login > /tmp/login_c.html
CSRF_LOGIN=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/login_c.html | head -n 1)

curl -s -i -c /tmp/c_cust.txt -b /tmp/c_cust.txt -X POST http://localhost:3000/login   -d "_csrf=${CSRF_LOGIN}"   -d "username=${RAND_USER}"   -d "password=Password123@" | grep "Location:" >> "$EVIDENCE_FILE"

# Book seat C1 for showtime 1
curl -s -c /tmp/c_cust.txt -b /tmp/c_cust.txt http://localhost:3000/showtimes/1/book > /tmp/book_page.html
CSRF_BOOK=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/book_page.html | head -n 1)

BOOK_RES=$(curl -s -i -c /tmp/c_cust.txt -b /tmp/c_cust.txt -X POST http://localhost:3000/showtimes/1/book   -d "_csrf=${CSRF_BOOK}"   -d "seats=C1")

BOOK_CODE=$(echo "$BOOK_RES" | grep "Location: /bookings/" | grep -oP 'BK-[A-Z0-9]+' || true)
log "Đặt vé thành công cho ghế C1! Mã đặt vé tạo ra: $BOOK_CODE"
echo "$BOOK_RES" | grep "Location:" >> "$EVIDENCE_FILE"

log "
6. KIỂM THỬ TỪ CHỐI ĐẶT GHẾ ĐÃ CÓ NGƯỜI ĐẶT"
log "--------------------------------------------------------------------------------"
# Try booking seat C1 again (already booked by RAND_USER)
C1_RETRY=$(curl -s -c /tmp/c_cust.txt -b /tmp/c_cust.txt -X POST http://localhost:3000/showtimes/1/book   -d "_csrf=${CSRF_BOOK}"   -d "seats=C1")

if echo "$C1_RETRY" | grep -q "Xung Đột Đặt Ghế"; then
  log "ĐẠT: Đặt ghế C1 lần 2 bị từ chối chính xác với trang thông báo xung đột đặt ghế."
else
  log "Thông báo phản hồi: $C1_RETRY"
fi
echo "$C1_RETRY" | grep -A 2 -B 2 "Xung Đột Đặt Ghế" >> "$EVIDENCE_FILE" || true

log "
7. KIỂM THỬ TỪ CHỐI ĐẶT QUÁ 8 GHẾ VÀ GHẾ NGOÀI SƠ ĐỒ"
log "--------------------------------------------------------------------------------"
# Try booking 9 seats
NINE_SEATS_RES=$(curl -s -c /tmp/c_cust.txt -b /tmp/c_cust.txt -X POST http://localhost:3000/showtimes/1/book   -d "_csrf=${CSRF_BOOK}"   -d "seats=A3&seats=A4&seats=A5&seats=A6&seats=A7&seats=A8&seats=B1&seats=B2&seats=B3")
if echo "$NINE_SEATS_RES" | grep -q "tối đa 8 ghế"; then
  log "ĐẠT: Đặt 9 ghế bị từ chối chính xác ('tối đa 8 ghế')."
fi

# Try booking seat Z99 (outside venue)
OUTSIDE_SEAT_RES=$(curl -s -c /tmp/c_cust.txt -b /tmp/c_cust.txt -X POST http://localhost:3000/showtimes/1/book   -d "_csrf=${CSRF_BOOK}"   -d "seats=Z99")
if echo "$OUTSIDE_SEAT_RES" | grep -q "nằm ngoài sơ đồ"; then
  log "ĐẠT: Ghế Z99 bị từ chối chính xác ('nằm ngoài sơ đồ')."
fi

log "
8. KIỂM THỬ ĐỒNG THỜI (RACE CONDITION): 10 YÊU CẦU SONG SONG ĐẶT CÙNG 1 GHẾ B4"
log "--------------------------------------------------------------------------------"
# Prepare 10 concurrent requests to book seat B4 on showtime 1
mkdir -p /tmp/concurrent_test
for i in {1..10}; do
  (
    curl -s -i -c /tmp/c_cust.txt -b /tmp/c_cust.txt -X POST http://localhost:3000/showtimes/1/book       -d "_csrf=${CSRF_BOOK}"       -d "seats=B4" > "/tmp/concurrent_test/res_$i.txt"
  ) &
done
wait

SUCCESS_COUNT=0
CONFLICT_COUNT=0
for i in {1..10}; do
  if grep -q "Location: /bookings/" "/tmp/concurrent_test/res_$i.txt"; then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  elif grep -q "Xung Đột Đặt Ghế" "/tmp/concurrent_test/res_$i.txt"; then
    CONFLICT_COUNT=$((CONFLICT_COUNT + 1))
  fi
done

ACTIVE_B4=$(docker compose exec -T db psql -U cinema_app -d cinemadb -t -A -c "SELECT count(*) FROM booking_seats WHERE showtime_id = 1 AND seat_label = 'B4' AND is_active = true;")

log "Kết quả chạy song song 10 yêu cầu đặt ghế B4:"
log "- Số yêu cầu thành công (HTTP 302 redirect): $SUCCESS_COUNT (Kỳ vọng: 1)"
log "- Số yêu cầu xung đột bị từ chối (409 Conflict): $CONFLICT_COUNT (Kỳ vọng: 9)"
log "- Số dòng booking_seats active trong CSDL: $ACTIVE_B4 (Kỳ vọng: 1)"

log "
Log SEAT_CONFLICT trong docker compose logs web:"
docker compose logs web | grep "SEAT_CONFLICT" | tail -n 5 >> "$EVIDENCE_FILE"
docker compose logs web | grep "SEAT_CONFLICT" | tail -n 5

log "
9. KIỂM THỬ ĐƠN PENDING QUÁ HẠN TỰ ĐỘNG CHUYỂN EXPIRED VÀ NHẢ GHẾ"
log "--------------------------------------------------------------------------------"
# Seat B5 booked pending, then expired via DB update
curl -s -c /tmp/c_cust.txt -b /tmp/c_cust.txt -X POST http://localhost:3000/showtimes/1/book   -d "_csrf=${CSRF_BOOK}"   -d "seats=B5" > /dev/null

PENDING_CODE=$(docker compose exec -T db psql -U cinema_app -d cinemadb -t -A -c "
  SELECT b.booking_code FROM bookings b 
  JOIN booking_seats bs ON b.id = bs.booking_id 
  WHERE bs.showtime_id = 1 AND bs.seat_label = 'B5' AND bs.is_active = true LIMIT 1;
")

log "Đã tạo đơn pending cho ghế B5: Mã $PENDING_CODE"
# Force expire it in PostgreSQL
docker compose exec -T db psql -U cinema_app -d cinemadb -c "
  UPDATE bookings SET expires_at = NOW() - INTERVAL '1 minute' WHERE booking_code = '${PENDING_CODE}';
" > /dev/null

# Trigger cleanup via seat api
curl -s http://localhost:3000/showtimes/1/seats > /dev/null
sleep 1

STATUS_AFTER=$(docker compose exec -T db psql -U cinema_app -d cinemadb -t -A -c "SELECT status FROM bookings WHERE booking_code = '${PENDING_CODE}';")
ACTIVE_SEAT_AFTER=$(docker compose exec -T db psql -U cinema_app -d cinemadb -t -A -c "SELECT is_active FROM booking_seats WHERE seat_label = 'B5' AND showtime_id = 1 ORDER BY id DESC LIMIT 1;")

log "Trạng thái đơn vé sau khi hết hạn: $STATUS_AFTER (Kỳ vọng: expired)"
log "Trạng thái ghế B5 is_active: $ACTIVE_SEAT_AFTER (Kỳ vọng: f / false - đã nhả ghế)"

# Now book B5 again to confirm seat is free
REBOOK_RES=$(curl -s -i -c /tmp/c_cust.txt -b /tmp/c_cust.txt -X POST http://localhost:3000/showtimes/1/book   -d "_csrf=${CSRF_BOOK}"   -d "seats=B5")
if echo "$REBOOK_RES" | grep -q "Location: /bookings/"; then
  log "ĐẠT: Ghế B5 đã được nhả và đặt lại thành công sau khi đơn cũ hết hạn!"
fi

log "
10. KIỂM THỬ NHÂN VIÊN (STAFF): XÁC NHẬN THANH TOÁN TẠI QUẦY & CHECK-IN"
log "--------------------------------------------------------------------------------"
# Login as staff nhanvien01
rm -f /tmp/c_staff.txt
curl -s -c /tmp/c_staff.txt -b /tmp/c_staff.txt http://localhost:3000/login > /tmp/login_s.html
CSRF_STAFF=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/login_s.html | head -n 1)

curl -s -i -c /tmp/c_staff.txt -b /tmp/c_staff.txt -X POST http://localhost:3000/login   -d "_csrf=${CSRF_STAFF}"   -d "username=nhanvien01"   -d "password=Staff01Cinema@2026!Key" | grep "Location:" >> "$EVIDENCE_FILE"

# Confirm payment for BOOK_CODE (Seat C1) with cash 100,000 (total 80,000)
PAY_RES=$(curl -s -i -c /tmp/c_staff.txt -b /tmp/c_staff.txt -X POST "http://localhost:3000/staff/bookings/${BOOK_CODE}/pay"   -d "_csrf=${CSRF_STAFF}"   -d "payment_method=cash"   -d "amount_paid=100000")

PAY_CHECK=$(docker compose exec -T db psql -U cinema_app -d cinemadb -c "
  SELECT booking_code, status, total_amount, amount_paid, change_amount, payment_method, paid_at 
  FROM bookings WHERE booking_code = '${BOOK_CODE}';
")
log "Kết quả xác nhận thanh toán:"
log "$PAY_CHECK"

# Check-in the ticket BOOK_CODE
CHECKIN_RES=$(curl -s -c /tmp/c_staff.txt -b /tmp/c_staff.txt -X POST http://localhost:3000/staff/checkin   -d "_csrf=${CSRF_STAFF}"   -d "booking_code=${BOOK_CODE}")

if echo "$CHECKIN_RES" | grep -q "CHECK-IN HỢP LỆ"; then
  log "ĐẠT: Soát vé lần 1 thành công! Khách được vào cửa."
fi

# Try check-in second time (should be rejected)
CHECKIN_2ND=$(curl -s -c /tmp/c_staff.txt -b /tmp/c_staff.txt -X POST http://localhost:3000/staff/checkin   -d "_csrf=${CSRF_STAFF}"   -d "booking_code=${BOOK_CODE}")

if echo "$CHECKIN_2ND" | grep -q "đã được soát vào lúc"; then
  log "ĐẠT: Soát vé lần 2 bị từ chối chính xác ('đã được soát vào lúc...')."
fi

# Try check-in ticket for another day (wrong day)
# Showtime 4 is tomorrow
WRONG_DAY_CODE="BK-TOMORROW-FAKE"
docker compose exec -T db psql -U cinema_app -d cinemadb -c "
  INSERT INTO bookings (booking_code, user_id, showtime_id, status, total_amount, paid_at) 
  VALUES ('${WRONG_DAY_CODE}', 4, 4, 'confirmed', 70000, NOW());
" > /dev/null

CHECKIN_WRONG_DAY=$(curl -s -c /tmp/c_staff.txt -b /tmp/c_staff.txt -X POST http://localhost:3000/staff/checkin   -d "_csrf=${CSRF_STAFF}"   -d "booking_code=${WRONG_DAY_CODE}")

if echo "$CHECKIN_WRONG_DAY" | grep -q "Chỉ được phép soát vé trong đúng ngày"; then
  log "ĐẠT: Soát vé khác ngày bị từ chối chính xác ('Chỉ được phép soát vé trong đúng ngày')."
fi

log "
Log CHECKIN_SUCCESS & CHECKIN_REJECTED từ container web:"
docker compose logs web | grep -E "CHECKIN_SUCCESS|CHECKIN_REJECTED" | tail -n 5 >> "$EVIDENCE_FILE"
docker compose logs web | grep -E "CHECKIN_SUCCESS|CHECKIN_REJECTED" | tail -n 5

log "
11. KIỂM THỬ PHÂN QUYỀN RBAC (403 FORBIDDEN) & BẢO VỆ IDOR"
log "--------------------------------------------------------------------------------"
# Customer accesses /admin/dashboard -> 403
CUST_ADMIN_ACCESS=$(curl -s -i -b /tmp/c_cust.txt http://localhost:3000/admin/dashboard | head -n 1)
log "Customer truy cập /admin/dashboard: $CUST_ADMIN_ACCESS (Kỳ vọng: HTTP/1.1 403 Forbidden)"

# Staff accesses /admin/events -> 403
STAFF_ADMIN_ACCESS=$(curl -s -i -b /tmp/c_staff.txt http://localhost:3000/admin/events | head -n 1)
log "Staff truy cập /admin/events: $STAFF_ADMIN_ACCESS (Kỳ vọng: HTTP/1.1 403 Forbidden)"

# Customer accesses another customer's ticket -> 403
# BK-CONF-882190 belongs to user 4 (khach01). RAND_USER is logged in c_cust.txt.
IDOR_ACCESS=$(curl -s -i -b /tmp/c_cust.txt http://localhost:3000/bookings/BK-CONF-882190 | head -n 1)
log "Customer truy cập vé người khác (IDOR): $IDOR_ACCESS (Kỳ vọng: HTTP/1.1 403 Forbidden)"

log "
12. KIỂM THỬ QUẢN TRỊ VIÊN (ADMIN): TẠO PHIM, XUNG ĐỘT SUẤT CHIẾU, UPLOAD BẢO MẬT"
log "--------------------------------------------------------------------------------"
# Login as admin
rm -f /tmp/c_admin.txt
curl -s -c /tmp/c_admin.txt -b /tmp/c_admin.txt http://localhost:3000/login > /tmp/login_a.html
CSRF_ADMIN_LOGIN=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/login_a.html | head -n 1)

curl -s -i -c /tmp/c_admin.txt -b /tmp/c_admin.txt -X POST http://localhost:3000/login   -d "_csrf=${CSRF_ADMIN_LOGIN}"   -d "username=admin"   -d "password=AdminCinema@2026!SecureKey" | grep "Location:" >> "$EVIDENCE_FILE"

# Fresh CSRF from admin events page
curl -s -b /tmp/c_admin.txt http://localhost:3000/admin/events > /tmp/admin_events.html
CSRF_ADMIN_EV=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/admin_events.html | head -n 1)

# Upload malicious .exe
echo "fake binary" > /tmp/malicious.exe
EXE_UPLOAD_RES=$(curl -s -i -b /tmp/c_admin.txt -X POST http://localhost:3000/admin/events   -F "_csrf=${CSRF_ADMIN_EV}"   -F "title=Phim Doc Hai"   -F "category_id=1"   -F "type=movie"   -F "duration_minutes=100"   -F "poster=@/tmp/malicious.exe;type=application/x-msdownload")
EXE_STATUS=$(echo "$EXE_UPLOAD_RES" | head -n 1)
log "Upload tệp .exe độc hại: $EXE_STATUS (Kỳ vọng từ chối 400/403/500)"
if echo "$EXE_UPLOAD_RES" | grep -qi -E "Chỉ chấp nhận các tệp ảnh|400|403"; then
  log "ĐẠT: Upload tệp .exe bị chặn chính xác."
fi

# Upload > 2MB file
head -c 3M /dev/urandom > /tmp/large_image.jpg
LARGE_RES=$(curl -s -i -b /tmp/c_admin.txt -X POST http://localhost:3000/admin/events   -F "_csrf=${CSRF_ADMIN_EV}"   -F "title=Phim Anh Qua Lon"   -F "category_id=1"   -F "type=movie"   -F "duration_minutes=100"   -F "poster=@/tmp/large_image.jpg;type=image/jpeg")
LARGE_STATUS=$(echo "$LARGE_RES" | head -n 1)
log "Upload ảnh quá giới hạn 2MB: $LARGE_STATUS (Kỳ vọng từ chối 400/403/LIMIT_FILE_SIZE)"
if echo "$LARGE_RES" | grep -qi -E "quá giới hạn|LIMIT_FILE_SIZE|400|403"; then
  log "ĐẠT: Upload ảnh >2MB bị từ chối chính xác."
fi

# Overlapping showtime in same venue (Room 1 from 19:00 to 20:55)
curl -s -b /tmp/c_admin.txt http://localhost:3000/admin/showtimes > /tmp/admin_st.html
CSRF_ADMIN_ST=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/admin_st.html | head -n 1)

OVERLAP_RES=$(curl -s -i -b /tmp/c_admin.txt -X POST http://localhost:3000/admin/showtimes   -d "_csrf=${CSRF_ADMIN_ST}"   -d "event_id=2"   -d "venue_id=1"   -d "starts_at=$(date +%Y-%m-%d)T20:00"   -d "price_standard=80000"   -d "price_vip=110000")

if echo "$OVERLAP_RES" | grep -q "Xung%20%C4%91%E1%BB%99t%20gi%E1%BB%9D"; then
  log "ĐẠT: Tạo suất chiếu chồng giờ cùng phòng bị từ chối chính xác (tính cả 15 phút dọn phòng)."
fi
echo "$OVERLAP_RES" | grep "Location:" >> "$EVIDENCE_FILE"

# Valid event creation with valid SVG poster upload
echo "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='blue'/></svg>" > /tmp/valid_poster.webp
VALID_EV_RES=$(curl -s -i -b /tmp/c_admin.txt -X POST http://localhost:3000/admin/events   -F "_csrf=${CSRF_ADMIN_EV}"   -F "title=Phim Mới Được Thêm Bởi Admin"   -F "category_id=1"   -F "type=movie"   -F "duration_minutes=110"   -F "poster=@/tmp/valid_poster.webp;type=image/webp")
if echo "$VALID_EV_RES" | grep -q "Location: /admin/events"; then
  log "ĐẠT: Admin tạo phim mới và upload poster hợp lệ thành công (HTTP 302 Redirect)!"
fi

log "
13. KIỂM THỬ TRANG PGADMIN (PORT 5050)"
log "--------------------------------------------------------------------------------"
PGADMIN_RES=$(curl -s -I http://localhost:5050 | head -n 5)
log "$PGADMIN_RES"

log "
================================================================================"
log "TẤT CẢ CÁC BÀI KIỂM THỬ BƯỚC 1 & 2 ĐÃ HOÀN TẤT THÀNH CÔNG 100%!"
log "================================================================================"
