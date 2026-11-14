// Idempotent consumer (inbox pattern) bằng Go: franz-go + pgx.
// Đọc topic "orders", dedup theo event_id trong cùng transaction với business effect,
// retry transient error với backoff, permanent error chuyển sang "orders.dlq".
// Chỉ commit offset SAU khi xử lý xong (at-least-once + inbox = effectively-once).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/twmb/franz-go/pkg/kgo"
)

type envelope struct {
	EventID   string `json:"event_id"`
	EventType string `json:"event_type"`
	Payload   struct {
		OrderID    int64  `json:"order_id"`
		CustomerID string `json:"customer_id"`
		TotalCents int64  `json:"total_cents"`
	} `json:"payload"`
}


func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// reserve ghi inbox và ledger trong CÙNG một transaction. Trả về true nếu là message mới.
func reserve(ctx context.Context, conn *pgx.Conn, e envelope) (bool, error) {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx) // no-op sau Commit

	tag, err := tx.Exec(ctx,
		`INSERT INTO processed_messages(message_id, consumer) VALUES ($1, 'inventory')
		 ON CONFLICT DO NOTHING`, e.EventID)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() == 0 { // duplicate: inbox đã có
		return false, tx.Commit(ctx)
	}
	if _, err = tx.Exec(ctx,
		`INSERT INTO ledger(order_id, reserved_cents) VALUES ($1, $2)`,
		e.Payload.OrderID, e.Payload.TotalCents); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}

func runConsumer() {
	ctx := context.Background()
	maxMsgs, _ := strconv.Atoi(env("MAX_MESSAGES", "8"))
	idle, _ := time.ParseDuration(env("IDLE_TIMEOUT", "15s"))

	conn, err := pgx.Connect(ctx, env("PG_DSN", "postgres://postgres:lab@bookcheck-msg-pg:5432/inventory"))
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close(ctx)

	cl, err := kgo.NewClient(
		kgo.SeedBrokers(env("KAFKA_BROKERS", "bookcheck-msg-kafka:9092")),
		kgo.ConsumerGroup(env("GROUP", "g-go")),
		kgo.ConsumeTopics("orders"),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
		kgo.DisableAutoCommit(),
		kgo.RequiredAcks(kgo.AllISRAcks()), // idempotent producer là mặc định của franz-go
	)
	if err != nil {
		log.Fatal(err)
	}
	defer cl.Close()

	seen := 0
	for seen < maxMsgs {
		pollCtx, cancel := context.WithTimeout(ctx, idle)
		fetches := cl.PollFetches(pollCtx)
		cancel()
		if pollCtx.Err() != nil && fetches.NumRecords() == 0 {
			fmt.Println("idle timeout, dừng")
			break
		}
		fetches.EachError(func(t string, p int32, err error) { log.Printf("fetch %s/%d: %v", t, p, err) })

		fetches.EachRecord(func(r *kgo.Record) {
			seen++
			var e envelope
			if err := json.Unmarshal(r.Value, &e); err != nil {
				log.Fatalf("payload không parse được: %v", err)
			}
			key := string(r.Key)

			// permanent error: số tiền âm -> DLQ ngay
			if e.Payload.TotalCents < 0 {
				fmt.Printf("[%s] LỖI VĨNH VIỄN (total<0) -> orders.dlq\n", e.EventID)
				dlq := fmt.Sprintf(`{"reason":"negative_total","attempts":1,"original":%s}`, r.Value)
				res := cl.ProduceSync(ctx, &kgo.Record{Topic: "orders.dlq", Key: r.Key, Value: []byte(dlq)})
				if err := res.FirstErr(); err != nil {
					log.Fatalf("produce DLQ: %v", err)
				}
			} else {
				// transient error: khách "flaky" lỗi 2 lần đầu, backoff 1s, 2s
				attempt, delay := 0, time.Second
				for {
					attempt++
					if e.Payload.CustomerID == "flaky" && attempt <= 2 {
						fmt.Printf("[%s] lần %d: lỗi tạm thời (503), chờ %s\n", e.EventID, attempt, delay)
						time.Sleep(delay)
						delay *= 2
						continue
					}
					break
				}
				fresh, err := reserve(ctx, conn, e)
				if err != nil {
					log.Fatalf("reserve: %v", err) // không commit offset -> redeliver sau restart
				}
				if fresh {
					fmt.Printf("[%s] order=%s xử lý MỚI (lần thử %d)\n", e.EventID, key, attempt)
				} else {
					fmt.Printf("[%s] order=%s TRÙNG, bỏ qua (inbox đã có)\n", e.EventID, key)
				}
			}
			// commit offset SAU khi xử lý (đảo thứ tự này = at-most-once)
			if err := cl.CommitRecords(ctx, r); err != nil {
				log.Fatalf("commit: %v", err)
			}
		})
	}
	fmt.Printf("đã đọc %d message\n", seen)
}
