# Lab observability

Xem hướng dẫn chạy và kết quả ở [`../12-lab-results.md`](../12-lab-results.md) và mục "Chạy lab" của [`../README.md`](../README.md).

Tóm tắt: `docker compose up -d --build` (build hai service Go từ `app/`), tạo traffic bằng `scripts/traffic.sh` (chạy 2 đợt), kiểm chứng bằng `scripts/verify.sh` (đều chạy trong container `curlimages/curl` cùng network `bookcheck-obsgo-net`), kiểm tra rule bằng `promtool` trong image `prom/prometheus:v3.16.0`, dọn bằng `docker compose down -v`. Không map port ra host.
