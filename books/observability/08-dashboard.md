# Chapter 8. Useful Dashboards and Useless Dashboards

## 1. Scenario

Công ty có "dashboard tổng quan" với 48 biểu đồ: CPU từng máy, RAM, số goroutine, hit rate cache... Khi incident xảy ra, mọi người dán màn hình đó vào kênh chat rồi hỏi nhau "cái nào bất thường?". Không ai biết biểu đồ nào quan trọng. Dashboard tồn tại nhưng không giúp ra quyết định.

## 2. Concepts

Dashboard là **câu trả lời dựng sẵn cho các câu hỏi đã biết**. Nó tốt khi người xem biết ngay: hệ thống ổn không? Nếu không, nhìn đâu tiếp theo?

### Useful dashboards: principles

1. **Mỗi dashboard có một người dùng và một câu hỏi.** "Sức khỏe dịch vụ Orders cho người trực", "Chi phí telemetry cho lead", "Capacity DB cho DBA".
2. **Trên cùng là SLI/SLO.** Hàng đầu: error rate, latency p95/p99, lượng request (RED), kèm đường SLO và budget còn lại. Nếu hàng này xanh thì phần dưới là để chẩn đoán, không phải để lo.
3. **Từ tổng quan xuống chi tiết**: service → endpoint → dependency → resource (USE). Mỗi biểu đồ có link tới dashboard con hoặc query trace/log tương ứng (ví dụ từ biểu đồ lỗi nhảy tới danh sách trace lỗi cùng khoảng thời gian).
4. **Ít biểu đồ, tên rõ, đơn vị rõ.** Tiêu đề là câu hỏi hoặc kết luận ("Error rate 5xx, %"), có đơn vị, trục bắt đầu từ 0 khi so sánh độ lớn.
5. **Percentile, không trung bình, cho latency.** Vẽ p50, p95, p99 hoặc heatmap của histogram; trung bình che đuôi chậm.
6. **Đánh dấu event**: deploy, bật feature flag, thay đổi cấu hình (annotation). Phần lớn incident bắt đầu bằng một thay đổi.
7. **Tách lỗi và thành công** khi vẽ latency (chương 3).
8. **Dùng biến (service, môi trường)** thay vì copy dashboard cho từng service.
9. **Dashboard là code**: lưu JSON/YAML trong git, review như code, không sửa tay trên giao diện production.

Hình mẫu bố cục:

```
┌──────────────────────────────────────────────────────────────────────┐
│ SLO orders-availability: 99,47% (target 99,5%)   Budget left: 12%    │ ← overall status
├──────────────┬──────────────────┬────────────────────────────────────┤
│ Request/s    │ Error rate %     │ Latency p50/p95/p99                │ ← RED
├──────────────┴──────────────────┴────────────────────────────────────┤
│ Per endpoint / per dependency (inventory-svc, DB): errors + latency  │ ← isolate
├──────────────────────────────────────────────────────────────────────┤
│ Resource (USE): CPU, memory, DB connection pool, queue depth         │ ← diagnose
│ Annotation: deploy v2.3.1 14:05, flag "new-pricing" on 14:20         │
└──────────────────────────────────────────────────────────────────────┘
```

### Useless dashboards: warning signs

| Dấu hiệu | Vì sao hại |
|---|---|
| Bức tường 40+ biểu đồ không phân cấp | Không biết nhìn đâu; chọn lọc bị chuyển cho người xem |
| Chỉ đo resource (CPU/RAM) | Không nói người dùng có bị ảnh hưởng không |
| Chỉ có trung bình | Che đuôi chậm, p99 có thể gấp 10 lần |
| Không có đơn vị, không có threshold | Số vô nghĩa, ai cũng diễn giải khác nhau |
| Biểu đồ "vì đo được" | Tốn query, gây nhiễu |
| Một dashboard cho mọi người | Không ai thấy đúng thứ mình cần |
| Dùng để thay alert ("có người nhìn mà") | Không ai nhìn lúc 3 giờ sáng; alert phải đến từ rule |
| Thiếu liên kết sang trace/log | Phát hiện được nhưng không điều tra được |
| Query nặng, tải chậm (nhiều series, window rất dài) | Chậm đúng lúc incident, có khi làm quá tải Prometheus |

Câu hỏi kiểm tra một biểu đồ: *"Nếu biểu đồ này đổi, tôi sẽ làm gì khác?"* Không có câu trả lời thì bỏ.

### Grafana in the lab context

Grafana là công cụ dashboard phổ biến nhất để đọc Prometheus, Tempo, Loki. Compose của lab có service `grafana` ở profile `grafana` (`docker compose --profile grafana up -d`), `mem_limit: 384m`, mặc định **tắt** để tiết kiệm RAM vì máy chạy nhiều tác vụ song song. Tôi **chưa chạy Grafana trong lần kiểm tra này**, nên chương không khẳng định giao diện hay phiên bản cụ thể của nó. Với lab, các câu query PromQL ở chương 3 và 7 chính là nội dung của các panel; bạn có thể tự thêm datasource Prometheus (`http://prometheus:9090`) khi bật profile.

## 3. Example: panels for orders-api

Các panel tối thiểu (mọi query có thật trong lab):

```promql
# Panel 1: error rate % (đối chiếu với SLO 0,5%)
100 * service:orders_error_ratio:rate5m

# Panel 2: request/s
sum(rate(traces_span_metrics_calls_total{service_name="orders-api",span_kind="SPAN_KIND_SERVER"}[5m]))

# Panel 3: latency p95 (ms) - metric của spanmetrics tính bằng mili giây
histogram_quantile(0.95, sum by (le) (rate(traces_span_metrics_duration_milliseconds_bucket{service_name="orders-api",span_kind="SPAN_KIND_SERVER"}[5m])))

# Panel 4: tốc độ đốt budget (burn rate)
service:orders_error_ratio:rate1h / 0.005
```

## 4. Trade-offs

- Dashboard nhiều chi tiết hỗ trợ điều tra nhưng làm quá tải người xem; tách "dashboard sức khỏe" (ít) và "dashboard chẩn đoán" (nhiều, có phân cấp).
- Dashboard tự dựng theo từng service tối ưu cho đội đó; dashboard chuẩn hóa theo template giúp mọi đội đọc được dashboard của nhau (RED sinh tự động từ span rất hợp).
- **Không dùng** dashboard làm cơ chế phát hiện incident chính; dùng alert.

## 5. Pitfalls

- Biểu đồ trung bình (`avg`) cho latency.
- Window `rate` không khớp scrape interval hoặc khác nhau giữa các panel, so sánh sai.
- Nhiều biểu đồ cùng tên, khác query sau mỗi lần ai đó "sửa nhanh".
- Trục Y tự co giãn làm một biến động nhỏ trông như thảm họa (hoặc ngược lại).
- Dashboard "mồ côi" không ai sở hữu, số liệu sai nhưng vẫn được tin.
- Biến đầy đủ cardinality (chọn theo `user_id`) làm panel nặng.

## 6. Summary

- Mỗi dashboard phục vụ một người dùng và một câu hỏi; trên cùng là SLI/SLO và RED.
- Phân cấp từ tổng quan xuống chi tiết, kèm liên kết sang trace/log và annotation deploy.
- Dùng percentile, đơn vị rõ ràng; lưu dashboard dưới dạng code.
- Dashboard không thay alert; biểu đồ không dẫn tới hành động thì bỏ.

## 7. Self-check questions

1. Bốn thứ nên có ở hàng trên cùng của dashboard dịch vụ?
2. Vì sao latency nên vẽ percentile thay vì trung bình?
3. Kể 3 dấu hiệu của dashboard vô ích.
4. Annotation deploy giúp gì khi điều tra incident?
5. Vì sao dashboard không thể thay cho alert?

<details><summary>Answer</summary>

1. Trạng thái SLO/budget, request/s, error rate, latency p95/p99 (RED + SLO).
2. Trung bình che đuôi chậm; một nhóm nhỏ người dùng có thể chậm gấp nhiều lần mà trung bình vẫn đẹp.
3. Hàng chục biểu đồ không phân cấp; chỉ có CPU/RAM; không đơn vị/threshold; không liên kết sang trace/log.
4. Cho thấy ngay tương quan giữa thời điểm thay đổi và thời điểm số liệu xấu đi, rút ngắn việc tìm nguyên nhân.
5. Dashboard cần người nhìn; incident 3 giờ sáng không ai nhìn. Alert từ rule tự chủ động gọi người đúng lúc.
</details>
