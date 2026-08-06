// Regenerate the scorecard from results/*.jsonl. The numbers in FINDINGS.md
// must be reproducible from committed data, never hand-typed. Run:
//   npx tsx research/lib/report.ts            # all probes
//   npx tsx research/lib/report.ts P2 P3      # selected probe ids

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CorpusClass, ProbeResult } from "./metrics.ts";

const RESULTS_DIR = new URL("../results/", import.meta.url).pathname;
const CLASSES: CorpusClass[] = ["A", "B", "C", "D"];

function loadResults(filter: string[]): ProbeResult[] {
  if (!existsSync(RESULTS_DIR)) return [];
  const rows: ProbeResult[] = [];
  for (const file of readdirSync(RESULTS_DIR)) {
    if (!file.endsWith(".jsonl")) continue;
    for (const line of readFileSync(join(RESULTS_DIR, file), "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const row = JSON.parse(trimmed) as ProbeResult;
      if (filter.length && !filter.some((f) => row.probeId.includes(f))) continue;
      rows.push(row);
    }
  }
  return rows;
}

interface Cell {
  attempted: number;
  ok: number;
}

function pct(cell: Cell): string {
  if (cell.attempted === 0) return "—";
  return `${Math.round((cell.ok / cell.attempted) * 100)}% (${cell.ok}/${cell.attempted})`;
}

function main(): void {
  const filter = process.argv.slice(2);
  const rows = loadResults(filter);
  if (rows.length === 0) {
    console.log("No results found in", RESULTS_DIR);
    return;
  }

  // probeId -> class -> Cell (best route per item, so we don't double-count).
  const byProbe = new Map<string, Map<CorpusClass, Cell>>();
  // Track best ok per (probe,item) to avoid multiple routes inflating counts.
  const seen = new Map<string, boolean>();
  for (const r of rows) {
    const itemKey = `${r.probeId}::${r.corpusId}`;
    const prev = seen.get(itemKey) ?? false;
    seen.set(itemKey, prev || r.ok);
  }

  const counted = new Set<string>();
  for (const r of rows) {
    const itemKey = `${r.probeId}::${r.corpusId}`;
    if (counted.has(itemKey)) continue;
    counted.add(itemKey);
    const cls = byProbe.get(r.probeId) ?? new Map<CorpusClass, Cell>();
    const cell = cls.get(r.class) ?? { attempted: 0, ok: 0 };
    cell.attempted += 1;
    if (seen.get(itemKey)) cell.ok += 1;
    cls.set(r.class, cell);
    byProbe.set(r.probeId, cls);
  }

  const probeIds = [...byProbe.keys()].sort();
  const header = ["Probe", ...CLASSES.map((c) => `Class ${c}`), "All"];
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  for (const probeId of probeIds) {
    const cls = byProbe.get(probeId)!;
    const all: Cell = { attempted: 0, ok: 0 };
    const cells = CLASSES.map((c) => {
      const cell = cls.get(c) ?? { attempted: 0, ok: 0 };
      all.attempted += cell.attempted;
      all.ok += cell.ok;
      return pct(cell);
    });
    lines.push(`| ${[probeId, ...cells, pct(all)].join(" | ")} |`);
  }

  console.log("\n## Probe success rate by article class\n");
  console.log(lines.join("\n"));
  console.log(`\n_${rows.length} result rows across ${probeIds.length} probes._`);
}

main();
