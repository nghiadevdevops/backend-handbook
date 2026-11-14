// Chương 11. Hàng đợi bằng BullMQ (cần Redis hoặc Valkey). Producer: queue.add(...); consumer: Worker bên dưới.
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { Db } from "./db.ts";
import type { AskService } from "./askService.ts";

export interface AskJobData {
  conversationId: number;
  pendingMessageId: number;
}
const QUEUE = "ask";
const BACKOFF_MS = [5_000, 30_000, 120_000];
const JOB_TIMEOUT_MS = 120_000; // lớn hơn timeout HTTP tới nhà cung cấp

export function createAskQueue(connection: ConnectionOptions): Queue<AskJobData> {
  return new Queue<AskJobData>(QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "custom" },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

export function createAskWorker(connection: ConnectionOptions, db: Db, ask: AskService): Worker<AskJobData> {
  const worker = new Worker<AskJobData>(
    QUEUE,
    async (job) => {
      // BullMQ không có timeout riêng cho từng job: tự đặt bằng AbortSignal.timeout.
      const signal = AbortSignal.timeout(JOB_TIMEOUT_MS);
      const timeout = new Promise<never>((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("job timeout")), { once: true }),
      );
      const result = await Promise.race([ask.answer(job.data.conversationId), timeout]);
      await db.query("UPDATE conversation_messages SET content = $2, meta = $3, status = 'done' WHERE id = $1", [
        job.data.pendingMessageId,
        JSON.stringify(result.content),
        JSON.stringify(result.meta),
      ]);
    },
    {
      connection,
      concurrency: 4, // giới hạn concurrency để không tự gây 429
      lockDuration: JOB_TIMEOUT_MS + 30_000, // lớn hơn thời gian chạy job để không bị coi là stalled rồi chạy chồng
      settings: { backoffStrategy: (attemptsMade) => BACKOFF_MS[Math.min(attemptsMade, BACKOFF_MS.length) - 1]! },
    },
  );

  // Hết số lần retry thì đánh dấu failed.
  worker.on("failed", async (job) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await db.query("UPDATE conversation_messages SET status = 'failed' WHERE id = $1", [job.data.pendingMessageId]);
    }
  });
  return worker;
}
