// Transactional outbox phía producer (chương 7): ghi order VÀ outbox trong CÙNG một transaction.
// Dùng: go run . place <customer_id> <total_cents>
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/jackc/pgx/v5"
)

func placeOrderWithOutbox(ctx context.Context, conn *pgx.Conn, customerID string, totalCents int64) (int64, error) {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) // no-op sau Commit

	var id int64
	err = tx.QueryRow(ctx,
		`INSERT INTO orders(customer_id, total_cents) VALUES ($1, $2) RETURNING id`,
		customerID, totalCents).Scan(&id)
	if err != nil {
		return 0, err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO outbox(aggregate_id, event_type, payload)
		 VALUES ($1, 'OrderPlaced',
		         jsonb_build_object('order_id', $2::bigint, 'customer_id', $3::text, 'total_cents', $4::bigint))`,
		strconv.FormatInt(id, 10), id, customerID, totalCents)
	if err != nil {
		return 0, err
	}
	return id, tx.Commit(ctx)
}

func main() {
	if len(os.Args) == 4 && os.Args[1] == "place" {
		ctx := context.Background()
		conn, err := pgx.Connect(ctx, env("PG_SHOP_DSN", "postgres://postgres:lab@bookcheck-msg-pg:5432/shop"))
		if err != nil {
			log.Fatal(err)
		}
		defer conn.Close(ctx)
		total, _ := strconv.ParseInt(os.Args[3], 10, 64)
		id, err := placeOrderWithOutbox(ctx, conn, os.Args[2], total)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("order %d và outbox đã ghi trong một transaction\n", id)
		return
	}
	runConsumer()
}
