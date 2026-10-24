#!/bin/bash
OUTPUT_FILE="/home/manh/cinema/evidence/buoc6-trivy.txt"

echo "================================================================================" > "$OUTPUT_FILE"
echo "BAO CAO QUET LO HONG BAO MAT CONTAINER IMAGE BANG TRIVY (aquasec/trivy:0.56.2)" >> "$OUTPUT_FILE"
echo "Thoi gian quet: $(date) | Tieu chi loc: Muc do HIGH, CRITICAL" >> "$OUTPUT_FILE"
echo "Du an: He thong Dat ve Xem phim va Su kien truc tuyen (Cinema and Event Booking)" >> "$OUTPUT_FILE"
echo "Sinh vien: Doan Ngoc Manh | MSSV: DTC245180048" >> "$OUTPUT_FILE"
echo "================================================================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

IMAGES=("cinema-web:latest" "cinema-alert-sink:latest" "nginxinc/nginx-unprivileged:1.27.1-alpine" "postgres:16.4-alpine" "prom/prometheus:v2.54.1" "grafana/grafana:11.2.0")

for img in "${IMAGES[@]}"; do
    echo "[*] Quet Trivy cho image: $img ..."
    echo "--------------------------------------------------------------------------------" >> "$OUTPUT_FILE"
    echo "IMAGE: $img" >> "$OUTPUT_FILE"
    echo "--------------------------------------------------------------------------------" >> "$OUTPUT_FILE"
    
    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock:ro -v trivy_cache:/root/.cache/ aquasec/trivy:0.56.2 image --severity HIGH,CRITICAL --scanners vuln --no-progress "$img" >> "$OUTPUT_FILE" 2>&1 || true
    echo "" >> "$OUTPUT_FILE"
done

echo "[+] Hoan tat quet Trivy! Da ghi vao $OUTPUT_FILE"
