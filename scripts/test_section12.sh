#!/usr/bin/env bash
set -e
cd ~/cinema

# Login as admin and store cookies
rm -f /tmp/c_admin.txt
curl -s -c /tmp/c_admin.txt -b /tmp/c_admin.txt http://localhost:3000/login > /tmp/login_page.html
CSRF_LOGIN=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/login_page.html | head -n 1)

curl -s -c /tmp/c_admin.txt -b /tmp/c_admin.txt -X POST http://localhost:3000/login   -d "_csrf=${CSRF_LOGIN}"   -d "username=admin"   -d "password=AdminCinema@2026!SecureKey" > /dev/null

# Get fresh CSRF token from authenticated admin page
curl -s -b /tmp/c_admin.txt http://localhost:3000/admin/events > /tmp/admin_events.html
CSRF_ADMIN=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/admin_events.html | head -n 1)

echo "=== TEST 12.1: UPLOAD MALICIOUS .EXE FILE ==="
echo "fake binary" > /tmp/malicious.exe
EXE_RES=$(curl -s -i -b /tmp/c_admin.txt -X POST http://localhost:3000/admin/events   -F "_csrf=${CSRF_ADMIN}"   -F "title=Phim Doc Hai"   -F "category_id=1"   -F "type=movie"   -F "duration_minutes=100"   -F "poster=@/tmp/malicious.exe;type=application/x-msdownload")

echo "$EXE_RES" | head -n 15

echo "=== TEST 12.2: UPLOAD OVER 2MB FILE ==="
head -c 3M /dev/urandom > /tmp/large_image.jpg
LARGE_RES=$(curl -s -i -b /tmp/c_admin.txt -X POST http://localhost:3000/admin/events   -F "_csrf=${CSRF_ADMIN}"   -F "title=Phim Anh Qua Lon"   -F "category_id=1"   -F "type=movie"   -F "duration_minutes=100"   -F "poster=@/tmp/large_image.jpg;type=image/jpeg")

echo "$LARGE_RES" | head -n 15

echo "=== TEST 12.3: OVERLAPPING SHOWTIME IN SAME VENUE ==="
curl -s -b /tmp/c_admin.txt http://localhost:3000/admin/showtimes > /tmp/admin_st.html
CSRF_ST=$(grep -oP 'name="_csrf" value="\K[^"]+' /tmp/admin_st.html | head -n 1)

OVERLAP_RES=$(curl -s -i -b /tmp/c_admin.txt -X POST http://localhost:3000/admin/showtimes   -d "_csrf=${CSRF_ST}"   -d "event_id=2"   -d "venue_id=1"   -d "starts_at=$(date +%Y-%m-%d)T20:00"   -d "price_standard=80000"   -d "price_vip=110000")

echo "$OVERLAP_RES" | grep -i "location:" || echo "$OVERLAP_RES" | head -n 10
