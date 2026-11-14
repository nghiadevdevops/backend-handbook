// Chương 3 và 6: consumer at-least-once với manual commit + inbox idempotent.
// Thư viện: @confluentinc/kafka-javascript (API tương thích KafkaJS, dựa trên librdkafka).
import { KafkaJS } from "@confluentinc/kafka-javascript";
import pg from "pg";

type Envelope = {
  event_id: string;
  event_type: string;
  payload: { order_id: number; customer_id: string; total_cents: number };
};

const pool = new pg.Pool({ connectionString: process.env.PG_DSN ?? "postgres://postgres:lab@bookcheck-msg-pg:5432/inventory" });

// Inbox: processed_messages + business effect trong CÙNG transaction.
export async function handleOrderPlaced(e: Envelope): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      "INSERT INTO processed_messages(message_id, consumer) VALUES ($1,'inventory') ON CONFLICT DO NOTHING",
      [e.event_id],
    );
    if (ins.rowCount === 0) { // duplicate
      await client.query("COMMIT");
      return false;
    }
    await client.query("INSERT INTO ledger(order_id, reserved_cents) VALUES ($1,$2)", [
      e.payload.order_id, e.payload.total_cents,
    ]);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const kafka = new KafkaJS.Kafka({
    kafkaJS: { brokers: [process.env.KAFKA_BROKERS ?? "bookcheck-msg-kafka:9092"] },
  });
  const consumer = kafka.consumer({
    kafkaJS: { groupId: "g-ts", fromBeginning: true, autoCommit: false },
  });
  await consumer.connect();
  await consumer.subscribe({ topics: ["orders"] });
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const e = JSON.parse(message.value!.toString()) as Envelope;
      await handleOrderPlaced(e); // có thể chạy lại, nhờ inbox nên an toàn
      // commit offset SAU khi xử lý (đảo thứ tự = at-most-once)
      await consumer.commitOffsets([
        { topic, partition, offset: String(Number(message.offset) + 1) },
      ]);
    },
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
