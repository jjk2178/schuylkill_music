import { openDB, type DBSchema } from "idb";
import type { Chart } from "../charts/schema";

type ScoreRecord = {
  id: string;
  chartTitle: string;
  score: number;
  accuracy: number;
  playedAt: number;
};

interface PluckDb extends DBSchema {
  charts: {
    key: string;
    value: Chart & { id: string };
  };
  scores: {
    key: string;
    value: ScoreRecord;
  };
}

const dbPromise = openDB<PluckDb>("pluck-n-play", 1, {
  upgrade(db) {
    db.createObjectStore("charts", { keyPath: "id" });
    db.createObjectStore("scores", { keyPath: "id" });
  },
});

export async function saveChart(id: string, chart: Chart): Promise<void> {
  const db = await dbPromise;
  await db.put("charts", { ...chart, id });
}

export async function listCharts(): Promise<Array<Chart & { id: string }>> {
  const db = await dbPromise;
  return db.getAll("charts");
}

export async function saveScore(record: ScoreRecord): Promise<void> {
  const db = await dbPromise;
  await db.put("scores", record);
}
