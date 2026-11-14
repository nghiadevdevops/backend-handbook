// Chương 8. Chấm bằng code; hàm ask gọi hệ thống thật (cần API key) hoặc fake khi test.
import { readFile } from "node:fs/promises";

export interface AskResult {
  answer: string;
  cited: string[];
  contextIds: string[];
}
export type Ask = (input: string) => Promise<AskResult>;

interface Expect {
  must_cite?: string[];
  must_say?: string[];
  forbid?: string[];
}
interface EvalCase {
  id: string;
  type: string;
  input: string;
  expect: Expect;
}
export interface EvalRow {
  id: string;
  type: string;
  passRate: number;
}

export class EvalRunner {
  private readonly ask: Ask;

  constructor(ask: Ask) {
    this.ask = ask;
  }

  async run(jsonlPath: string, repeats = 3): Promise<EvalRow[]> {
    const lines = (await readFile(jsonlPath, "utf8")).split("\n").filter((l) => l.trim() !== "");
    const rows: EvalRow[] = [];
    for (const line of lines) {
      const c = JSON.parse(line) as EvalCase;
      let passes = 0;
      for (let i = 0; i < repeats; i++) {
        passes += this.check(c.expect, await this.ask(c.input)) ? 1 : 0;
      }
      rows.push({ id: c.id, type: c.type, passRate: passes / repeats });
    }
    return rows;
  }

  private check(e: Expect, r: AskResult): boolean {
    const a = r.answer.toLowerCase();
    for (const id of e.must_cite ?? []) if (!r.cited.includes(id)) return false;
    for (const id of r.cited) if (!r.contextIds.includes(id)) return false; // không được cite ID ngoài context
    for (const s of e.must_say ?? []) if (!a.includes(s.toLowerCase())) return false;
    for (const s of e.forbid ?? []) if (a.includes(s.toLowerCase())) return false;
    return true;
  }
}
