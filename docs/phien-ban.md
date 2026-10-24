# Bảng Quản lý Phiên bản Image và Thành phần Hệ thống

| Thành phần | Image | Tag cố định | Mục đích sử dụng | Trạng thái kiểm chứng |
|------------|-------|-------------|------------------|----------------------|
| **db** | `postgres` | `16.4-alpine` | Cơ sở dữ liệu chính PostgreSQL | Đã pull & kiểm chứng |
| **web** | `node` | `20.18-alpine` | Nền tảng chạy ứng dụng Node.js Express/EJS | Đã pull & kiểm chứng |
| **pgadmin** | `dpage/pgadmin4` | `8.11` | Giao diện quản trị CSDL PostgreSQL | Đã pull & kiểm chứng |
| **nginx** | `nginxinc/nginx-unprivileged` | `1.27.1-alpine` | Reverse Proxy & SSL Termination (Bước 3) | Đã pull & kiểm chứng |
| **prometheus** | `prom/prometheus` | `v2.54.1` | Thu thập metrics (Bước 4) | Đã pull & kiểm chứng |
| **grafana** | `grafana/grafana` | `11.2.0` | Dashboard trực quan hóa (Bước 4) | Đã pull & kiểm chứng |
| **cadvisor** | `gcr.io/cadvisor/cadvisor` | `v0.49.1` | Giám sát tài nguyên container (Bước 4) | Đã pull & kiểm chứng |
| **nginx-exporter** | `nginx/nginx-prometheus-exporter` | `1.3.0` | Exporter metrics cho Nginx (Bước 4) | Đã pull & kiểm chứng |
| **postgres-exporter** | `prometheuscommunity/postgres-exporter` | `v0.15.0` | Exporter metrics PostgreSQL (Bước 4) | Đã pull & kiểm chứng |
| **loki** | `grafana/loki` | `3.1.1` | Lưu trữ log tập trung (Bước 5) | Đã pull & kiểm chứng |
| **promtail** | `grafana/promtail` | `3.1.1` | Thu thập log container (Bước 5) | Đã pull & kiểm chứng |
| **alert-sink** | Build nội bộ / `node:20.18-alpine` | `20.18-alpine` | Tiếp nhận cảnh báo Alert & Log Streamer (Bước 5) | Đã build & kiểm chứng |
| **trivy** | `aquasec/trivy` | `0.56.2` | Quét lỗ hổng container (Bước 6) | Đã pull & kiểm chứng |
