#!/usr/bin/env bash
set -e
cd ~/cinema

echo "=== 1. TAO USER EXPORTER TRONG DATABASE ==="
docker compose exec -T db psql -U cinema_app -d cinemadb << 'SQLEOF'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'exporter') THEN
    CREATE ROLE exporter LOGIN PASSWORD 'ExporterCinema@2026!Key';
  END IF;
END
$$;
GRANT pg_monitor TO exporter;
SQLEOF
echo "User exporter da duoc tao va cap quyen pg_monitor thanh cong."

echo "=== 2. KHOI DONG TAT CA CONTAINER BUOC 4 ==="
docker compose up -d

echo "=== 3. KIEM TRA CU PHAP NGINX VA RELOAD ==="
docker compose exec nginx nginx -t
docker compose restart nginx

echo "=== HOAN TAT AP DUNG BUOC 4 ==="
