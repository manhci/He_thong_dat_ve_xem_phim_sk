#!/usr/bin/env bash
set -e

# Thu muc chua chung chi
CERTS_DIR="$(cd "$(dirname "$0")/certs" && pwd)"
mkdir -p "$CERTS_DIR"

# Nhan IP LAN tuy chon tu tham so truyen vao
LAN_IP="${1:-}"
SAN_CONFIG="DNS:localhost,IP:127.0.0.1"
if [ -n "$LAN_IP" ]; then
  SAN_CONFIG="$SAN_CONFIG,IP:$LAN_IP"
fi

echo "================================================================================"
echo "Khoi tao chung chi SSL/TLS tu ky (Self-Signed Certificate)"
echo "CN: localhost"
echo "SAN: $SAN_CONFIG"
echo "Thoi han: 365 ngay"
echo "================================================================================"

# Sinh khoa rieng RSA 2048 bit va chung chi X.509
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERTS_DIR/server.key" \
  -out "$CERTS_DIR/server.crt" \
  -subj "/C=VN/ST=HaNoi/L=HaNoi/O=CinemaDevOps/OU=Security/CN=localhost" \
  -addext "subjectAltName=$SAN_CONFIG"

# Phan quyen bao mat cho file khoa rieng
chmod 600 "$CERTS_DIR/server.key"
chmod 644 "$CERTS_DIR/server.crt"

echo "Tao chung chi thanh cong:"
echo " - Key: $CERTS_DIR/server.key"
echo " - CRT: $CERTS_DIR/server.crt"
