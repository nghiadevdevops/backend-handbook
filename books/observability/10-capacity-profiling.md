# Chapter 10. Tracking Capacity, Performance and Continuous Profiling

## 1. Scenario

Mỗi dịp khuyến mãi, `orders-api` chậm dần rồi sập vào giờ cao điểm. Sau đó đội thêm máy "cho chắc", hóa đơn tăng nhưng không ai biết cần bao nhiêu máy cho đợt sau. Và khi đã đủ máy mà vẫn chậm, bottleneck lại nằm trong code: một hàm serialize JSON ngốn 30% CPU mà metric không cho thấy. Chương này gồm hai nửa: **capacity** (đủ resource không, bao giờ hết) và **profiling** (resource đang đi vào dòng code nào).

## 2. Concepts

### Capacity: tracking with USE and saturation

Với mỗi resource (CPU, memory, đĩa, mạng, DB connection pool, goroutine và event loop, độ sâu queue) theo dõi theo USE (chương 3): **utilization**, **saturation**, **errors**. Saturation là signal sớm nhất: queue bắt đầu dài trước khi resource "đầy 100%".

| Resource | Utilization | Saturation | Nguồn metric thường gặp |
|---|---|---|---|
| CPU | `1 - rate(node_cpu_seconds_total{mode="idle"}[5m])` | load average/số core, run queue | node_exporter |
| Memory | `1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes` | swap, OOM kill | node_exporter |
| Đĩa | `node_filesystem_avail_bytes` | I/O wait | node_exporter |
| Pool DB | connection đang dùng / tối đa | số request đang chờ connection | exporter của DB/app |
| Runtime Go và Node.js | số request đang xử lý, heap, goroutine (Go) hoặc event loop utilization (Node) | GC pause, event loop delay p99, hàng đợi chờ connection | `go.goroutine.count` (lab chạy thật), `perf_hooks` (chương 11) |
| Queue | - | độ sâu queue, tuổi message cũ nhất | broker exporter |

(Tên metric node_exporter ở trên là tên thật; lab không chạy node_exporter.)

### Little's law and pool sizing

`số request đồng thời (L) = throughput (λ) × thời gian xử lý (W)`. Ví dụ 200 request/s, mỗi request 150 ms: trung bình 30 request đồng thời. Pool connection DB và giới hạn đồng thời (số goroutine đang xử lý, số worker) phải lớn hơn mức này cộng đệm cho dao động, và mỗi request giữ memory nên tổng RAM là ràng buộc cứng. Khi latency của dependency (inventory) tăng gấp đôi, nhu cầu số request đồng thời cũng gấp đôi dù traffic không đổi: đây là cơ chế cascading failure phổ biến.

### Forecasting and safety margin

- **Linear forecast** cho đĩa/memory chậm đầy: `predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[6h], 4 * 3600) < 0` nghĩa là "nếu xu hướng 6 giờ qua tiếp tục, 4 giờ nữa hết đĩa". Đặt làm ticket hoặc page có điều kiện, vì đây là nguyên nhân dự báo *chắc chắn*.
- **Tăng trưởng theo seasonality**: so với cùng thời điểm tuần/tháng trước (`offset 1w`), không chỉ đường xu hướng thẳng.
- **Headroom**: giữ dư (ví dụ chịu được mất một zone/node, N+1) và đo bằng **load test** (tăng dần tải đến khi p95 vượt SLO) thay vì đoán.
- Gắn capacity với SLO: câu hỏi cuối cùng là "tới mức tải nào thì SLO bị phạm?", không phải "CPU bao nhiêu phần trăm?".

### Performance: questions in order

1. Chậm ở đâu? Trace cho thấy span chậm (chương 5).
2. Chậm vì chờ (I/O, lock, dependency) hay vì tính toán (CPU)? Nếu span chiếm thời gian mà CPU thấp thì là chờ.
3. Nếu tính toán: **profile** cho biết hàm nào.

### Profiling and continuous profiling

**Profiler** sampling call stack theo chu kỳ (ví dụ 100 lần/giây), cộng dồn thành **flame graph**: chiều rộng một khung là tỉ lệ thời gian CPU (hoặc memory cấp phát) ở hàm đó và các hàm nó gọi. Có profile CPU, wall-clock (kể cả lúc chờ), cấp phát memory, lock/contention.

Profiling truyền thống là *sự kiện*: sau incident bạn mới gắn profiler lên, và incident đã qua. **Continuous profiling** chạy profiler sampling **luôn bật** với chi phí thấp, lưu theo thời gian và gắn label (service, version, host), để:

- So sánh flame graph trước/sau deploy (performance regression ngay trong ngày).
- Mở profile của đúng khoảng thời gian incident, kể cả khi không ai chuẩn bị.
- Tối ưu có bằng chứng: tìm hàm chiếm nhiều CPU nhất toàn đội máy và tính ra tiết kiệm được bao nhiêu máy.

Công cụ phổ biến: Grafana **Pyroscope**, **Parca**, và các dịch vụ thương mại. Kỹ thuật thu thập: SDK trong tiến trình (pprof của Go, `@pyroscope/nodejs`), hoặc **eBPF** (agent cấp hệ thống, không sửa code).

#### Go: pprof

`net/http/pprof` có sẵn trong thư viện chuẩn: chỉ cần `import _ "net/http/pprof"` và mở một listener riêng (lab dùng `:6060`, không map ra host; không bao giờ mở endpoint này ra internet vì nó lộ chi tiết nội bộ và cho phép gây tải). Lấy profile bằng `go tool pprof`:

```bash
go tool pprof -top http://orders:6060/debug/pprof/heap               # memory đang giữ (inuse_space)
go tool pprof -top "http://orders:6060/debug/pprof/profile?seconds=30" # CPU trong 30 giây
curl "http://orders:6060/debug/pprof/goroutine?debug=1"              # dump goroutine (phát hiện leak)
```

Đã chạy trong lab (chương 12): dump goroutine trả `goroutine profile: total 11` và `pprof -top` trên heap trả về `inuse_space` ≈ 1,5 MB (service gần như rảnh nên không có điểm nóng). Profile CPU 30 giây **chưa chạy** trong lab. Có các profile `heap`, `allocs`, `goroutine`, `block`, `mutex`, `threadcreate`; `block` và `mutex` mặc định tắt, cần `runtime.SetBlockProfileRate` và `runtime.SetMutexProfileFraction`. Để lưu liên tục, dùng SDK `github.com/grafana/pyroscope-go` (`pyroscope.Start(...)`, mặc định gồm CPU và các profile cấp phát; theo docs Grafana khi kiểm tra) hoặc để Grafana Alloy thu thập theo kiểu pull. Ngoài ra Go có `runtime/trace` (execution trace) khi cần xem lịch thực thi của goroutine.

#### Node.js: profiling overview

- **CPU profile và heap profile có sẵn trong Node.js**: `node --cpu-prof app.js` và `node --heap-prof app.js` ghi file `.cpuprofile`/`.heapprofile` mở được bằng Chrome DevTools; `node --inspect` cho phép gắn DevTools vào process đang chạy (chỉ nghe trên localhost hoặc đường hầm an toàn). Các cờ này tôi **chưa chạy** trong lab.
- **Continuous profiling**: package `@pyroscope/nodejs` (`Pyroscope.init({...})` rồi `Pyroscope.start()`; cần `wall.collectCpuTime: true` để có CPU profile, theo docs Grafana). Tôi không kiểm tra được số phiên bản Node.js được hỗ trợ từ trang docs đó.
- **eBPF**: component `pyroscope.ebpf` của Grafana Alloy liệt kê Node.js/V8 trong các runtime được hỗ trợ (cờ `v8_enabled`, mặc định bật), cùng Go (`go_enabled`); Alloy phải chạy với quyền root trong PID namespace của host (hoặc cấp riêng các capability cần thiết).
- Với Node, thêm số đo event loop (chương 11): profile cho biết hàm nào chặn event loop, event loop delay cho biết chặn bao lâu.

**Liên kết với trace**: ý tưởng "span profile" gắn profile vào span/trace ID để từ một span chậm nhảy sang flame graph đúng khoảng đó. Mô hình dữ liệu OTel Profiles có trường trace/span ID cho mục đích này, nhưng như chương 1 đã nói signal này mới ở mức **Alpha** (cần Collector >= 0.148.0, chưa có backend sẵn sàng production). Hiện tại việc liên kết dựa vào công cụ riêng của từng backend.

Chi phí (overhead): continuous profiler được thiết kế dựa trên sampling nên chi phí thấp, nhưng con số cụ thể phụ thuộc runtime, tần suất sampling và loại profile; **hãy tự đo** trên workload của bạn trước khi bật toàn bộ. Tôi không đưa con số chung ở đây.

## 3. Example

Quy trình tìm điểm nóng khi `orders-api` p95 tăng sau deploy:

```text
1. Dashboard: p95 tăng từ 120 ms lên 340 ms từ 14:05 (annotation deploy v2.3.1)
2. Trace mẫu chậm: span "GET /order" dài; span con gọi inventory ngắn  → thời gian ở trong chính orders-api
3. CPU orders-api tăng, không có chờ I/O                               → vấn đề tính toán
4. Flame graph v2.3.1 so với v2.3.0: hàm `json.Marshal` chiếm 35% (trước 6%)
5. Sửa (ví dụ bỏ serialize payload lớn trong vòng lặp) → deploy → so lại flame graph và p95
```

Trong lab, p95 đo được là 50 ms (cận trên bucket, chương 12); phần đuôi đến từ `SLOW_RATE=5%` (400 ms ngủ có chủ đích ở inventory), một ví dụ "chậm vì chờ", không phải CPU: span `SELECT stock` chiếm thời gian trong khi CPU rảnh, nên profile CPU sẽ không giúp, trace mới giúp.

## 4. Trade-offs

- Capacity theo mô hình + load test chính xác nhưng tốn công; chỉ dựa vào CPU hiện tại thì rẻ nhưng bỏ sót bottleneck khác (pool DB, lock).
- Dư resource tốn tiền; thiếu thì vi phạm SLO. Autoscaling giúp nhưng khởi động chậm, và downstream dependency (DB) không scale theo.
- Continuous profiling: lợi ích lớn trong điều tra và tối ưu chi phí; đổi lại thêm agent, quyền đặc biệt (eBPF cần root/capability), chi phí lưu trữ và vận hành.
- **Không dùng** profiler CPU để tìm vấn đề chờ I/O; dùng trace hoặc profile wall-clock.

## 5. Pitfalls

- Chỉ theo dõi utilization mà bỏ saturation.
- Cấu hình pool/worker vượt khả năng DB hoặc RAM (thêm worker làm DB quá tải nặng hơn).
- Dự báo tuyến tính cho dữ liệu có seasonality rõ: báo giả hoặc bỏ sót.
- Tối ưu theo cảm tính thay vì flame graph.
- Bật mọi loại profile ở mọi nơi mà không đo overhead.
- Profile dữ liệu nhạy cảm: tên hàm và label thường vô hại, nhưng kiểm tra label tùy chỉnh.
- Dựa vào OTLP Profiles (Alpha) cho production.

## 6. Summary

- Capacity: theo USE, chú trọng saturation; Little's law cho kích thước pool; `predict_linear` và load test cho dự báo.
- Hỏi theo thứ tự: chậm ở đâu (trace), chờ hay tính toán, rồi mới profile.
- Continuous profiling = sampling luôn bật + flame graph theo thời gian + label phiên bản.
- OTel Profiles còn Alpha; eBPF và các công cụ riêng là lựa chọn hiện tại; tự đo overhead.

## 7. Self-check questions

1. 300 request/s, thời gian xử lý trung bình 200 ms: số request đồng thời trung bình là bao nhiêu?
2. Vì sao saturation báo sớm hơn utilization?
3. Viết ý nghĩa của `predict_linear(node_filesystem_avail_bytes[6h], 14400) < 0`.
4. Continuous profiling giải quyết điều gì mà profiling "bật khi có incident" không làm được?
5. Khi nào profile CPU không giúp tìm nguyên nhân chậm?

<details><summary>Answer</summary>

1. L = λ × W = 300 × 0,2 = 60.
2. Queue dài ra khi resource sắp bão hòa, trước khi utilization chạm 100%, nên người dùng đã chậm mà utilization chưa báo.
3. Nếu xu hướng 6 giờ qua tiếp tục thì dung lượng trống sẽ âm (hết đĩa) trong 4 giờ (14.400 giây).
4. Có dữ liệu cho khoảng thời gian đã qua, so sánh trước/sau deploy, phát hiện hồi quy và điểm nóng không cần tái hiện incident.
5. Khi thời gian bị chiếm bởi chờ (I/O, lock, gọi dependency chậm) chứ không phải tính toán; dùng trace hoặc wall-clock profile.
</details>
