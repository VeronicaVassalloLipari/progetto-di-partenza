import { createOpencode } from "@opencode-ai/sdk";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type ReviewerName = "movements-reviewer" | "amount-compliance-reviewer" | "api-contract-reviewer" | "security-reviewer";
type ReviewerStatus = "ok" | "failed" | "unparseable" | "budget";

const SEVERITY_ORDER: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const REVIEWER_NAMES: ReviewerName[] = [
  "movements-reviewer",
  "amount-compliance-reviewer",
  "api-contract-reviewer",
  "security-reviewer",
];
const REVIEWER_PREFIX: Record<string, string> = {
  "movements-reviewer": "MOV",
  "amount-compliance-reviewer": "AMT",
  "api-contract-reviewer": "AC",
  "security-reviewer": "SEC",
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const AGENTS_DIR = join(ROOT, ".opencode", "agents");

interface Usage {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
}

interface Finding {
  id: string;
  file: string;
  line: string;
  lineStart: number | null;
  lineEnd: number | null;
  severity: Severity;
  category: string;
  rule: string;
  issue: string;
  evidence: string;
  proposedFix: string;
  reviewer: string;
}

interface ReviewerResult {
  reviewer: string;
  status: ReviewerStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sessionId: string | null;
  usage: Usage;
  text: string;
  findings: Finding[];
  error?: string;
  parseError?: string;
}

interface Args {
  target: string | null;
  diff: string | null;
  outDir: string | null;
  maxSeconds: number;
  maxTokens: number;
  maxCostUsd: number;
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  model: string | null;
  failOn: Severity;
  reviewers: string[];
  help: boolean;
}

const HELP = `Code Review Suite — LipariBank

Uso:
  node --experimental-strip-types .opencode/code-review-suite.ts [target] [opzioni]
  npm run review -- [target] [opzioni]

Target:
  [target]                     file o cartella da rivedere (default: src/main/java/com/lipari/bank)
  --diff <ref>                 rivede il diff git rispetto a <ref> (es. HEAD~1)
  --target <path>              alternativa al primo argomento

Output:
  --out <dir>                  cartella del report (default: docs/review-runs/<run-id>)

Tetti (il run si interrompe al superamento):
  --max-seconds <n>            durata massima in secondi (default: 600; 0 = nessun tetto)
  --max-tokens <n>             token massimi (default: 200000; 0 = nessun tetto)
  --max-cost <usd>             costo massimo stimato in USD (default: 1.00; 0 = nessun tetto)
  --input-usd-per-mtok <n>     tariffa input per milione di token (default: 0)
  --output-usd-per-mtok <n>    tariffa output per milione di token (default: 0)

Review:
  --model <provider/model>     modello esplicito (default: quello di OpenCode)
  --reviewers <a,b,c>          reviewer da lanciare (default: tutti e quattro)
  --fail-on <severity>         soglia per l'exit code di gate (default: CRITICAL)
  --help                       questo testo

Exit code:
  0  nessun finding alla soglia, nessun reviewer fallito
  1  almeno un finding alla soglia --fail-on
  2  tetto superato (run interrotto)
  3  almeno un reviewer fallito o non interpretabile
  4  errore di setup (target, agent, SDK)
`;

function parseNum(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name}: atteso un numero >= 0, ricevuto ${value}`);
  return n;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    target: null,
    diff: null,
    outDir: null,
    maxSeconds: 600,
    maxTokens: 200000,
    maxCostUsd: 1,
    inputUsdPerMTok: parseNum(process.env.REVIEW_INPUT_USD_PER_MTOK ?? "0", "REVIEW_INPUT_USD_PER_MTOK"),
    outputUsdPerMTok: parseNum(process.env.REVIEW_OUTPUT_USD_PER_MTOK ?? "0", "REVIEW_OUTPUT_USD_PER_MTOK"),
    model: process.env.REVIEW_MODEL ?? null,
    failOn: "CRITICAL",
    reviewers: [...REVIEWER_NAMES],
    help: false,
  };

  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--help" || a === "-h") {
      args.help = true;
    } else if (a === "--target") {
      args.target = rest[++i] ?? null;
    } else if (a === "--diff") {
      args.diff = rest[++i] ?? null;
    } else if (a === "--out") {
      args.outDir = rest[++i] ?? null;
    } else if (a === "--max-seconds") {
      args.maxSeconds = parseNum(rest[++i] ?? "", "--max-seconds");
    } else if (a === "--max-tokens") {
      args.maxTokens = parseNum(rest[++i] ?? "", "--max-tokens");
    } else if (a === "--max-cost") {
      args.maxCostUsd = parseNum(rest[++i] ?? "", "--max-cost");
    } else if (a === "--input-usd-per-mtok") {
      args.inputUsdPerMTok = parseNum(rest[++i] ?? "", "--input-usd-per-mtok");
    } else if (a === "--output-usd-per-mtok") {
      args.outputUsdPerMTok = parseNum(rest[++i] ?? "", "--output-usd-per-mtok");
    } else if (a === "--model") {
      args.model = rest[++i] ?? null;
    } else if (a === "--reviewers") {
      const raw = rest[++i] ?? "";
      args.reviewers = raw.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--fail-on") {
      const raw = (rest[++i] ?? "").toUpperCase();
      if (!SEVERITY_ORDER.includes(raw as Severity)) throw new Error(`--fail-on: gravita non valida: ${raw}`);
      args.failOn = raw as Severity;
    } else if (a.startsWith("-")) {
      throw new Error(`opzione sconosciuta: ${a}`);
    } else if (!args.target) {
      args.target = a;
    } else {
      throw new Error(`argomento inatteso: ${a}`);
    }
  }

  if (!args.target && !args.diff) args.target = "src/main/java/com/lipari/bank";
  if (args.reviewers.length === 0) throw new Error("--reviewers: almeno un reviewer");
  return args;
}

function emptyUsage(): Usage {
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageFromInfo(info: any): Usage {
  const tokens = info?.tokens ?? {};
  const cache = tokens?.cache ?? {};
  const input = num(tokens.input);
  const output = num(tokens.output);
  const reasoning = num(tokens.reasoning);
  const cacheRead = num(cache.read);
  const cacheWrite = num(cache.write);
  const total = num(tokens.total) || input + output + reasoning + cacheRead + cacheWrite;
  return { input, output, reasoning, cacheRead, cacheWrite, total, cost: num(info?.cost) };
}

function addUsage(target: Usage, other: Usage): Usage {
  target.input += other.input;
  target.output += other.output;
  target.reasoning += other.reasoning;
  target.cacheRead += other.cacheRead;
  target.cacheWrite += other.cacheWrite;
  target.total += other.total;
  target.cost += other.cost;
  return target;
}

function sumUsage(values: Usage[]): Usage {
  return values.reduce((acc, value) => addUsage(acc, value), emptyUsage());
}

function estimatedCost(usage: Usage, args: Args): number {
  const inputRate = args.inputUsdPerMTok;
  const outputRate = args.outputUsdPerMTok;
  const billableInput = usage.input + usage.cacheRead + usage.cacheWrite;
  const billableOutput = usage.output + usage.reasoning;
  return (billableInput / 1_000_000) * inputRate + (billableOutput / 1_000_000) * outputRate;
}

function effectiveCost(usage: Usage, args: Args): number {
  return Math.max(usage.cost, estimatedCost(usage, args));
}

function severityRank(severity: string): number {
  const index = SEVERITY_ORDER.indexOf(severity.toUpperCase() as Severity);
  return index >= 0 ? index : 0;
}

function highestSeverity(values: string[]): Severity {
  return [...new Set(values.map((v) => v.toUpperCase()))]
    .sort((a, b) => severityRank(b) - severityRank(a))[0] as Severity;
}

function extractText(parts: any[]): string {
  return (parts ?? [])
    .filter((part) => part?.type === "text" && !part?.ignored && !part?.synthetic)
    .map((part) => String(part.text ?? ""))
    .join("\n")
    .trim();
}

function extractTextFromMessages(messages: any[]): string {
  const chunks: string[] = [];
  for (const message of messages ?? []) {
    if (message?.info?.role !== "assistant") continue;
    const text = extractText(message?.parts ?? []);
    if (text) chunks.push(text);
  }
  return chunks.join("\n\n").trim();
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[`*_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFile(value: string): string {
  return normalizeKey(value.replace(/\\/g, "/"))
    .replace(/^\.\//, "")
    .replace(/^[a-z]:\//, "");
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "non", "del", "della", "dei", "degli",
  "una", "uno", "che", "con", "per", "nel", "nella", "sono", "essere", "viene", "viene", "essere",
  "alla", "allo", "agli", "delle", "dello", "sul", "sulla", "come", "anche", "piu", "meno",
]);

function tokens(value: string): Set<string> {
  const result = new Set<string>();
  for (const token of normalizeKey(value).split(/[^a-z0-9_]+/)) {
    if (token.length >= 4 && !STOP_WORDS.has(token)) result.add(token);
  }
  return result;
}

function similarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
}

function codeTokens(value: string): Set<string> {
  const result = new Set<string>();
  for (const token of value.match(/[A-Za-z_][A-Za-z0-9_]{4,}/g) ?? []) {
    if (!STOP_WORDS.has(token.toLowerCase())) result.add(token.toLowerCase());
  }
  return result;
}

function parseLine(value: string): { start: number | null; end: number | null } {
  const match = value.match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
  if (!match) return { start: null, end: null };
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  return { start, end };
}

function parseReview(text: string, reviewer: string): { findings: Finding[]; parseError?: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const findings: Finding[] = [];
  let current: Partial<Finding> | null = null;
  let currentField: keyof Finding | null = null;
  let inFindings = false;
  let sawNoViolation = false;

  const close = () => {
    if (!current) return;
    const f = current as Finding;
    if (!f.id) f.id = `${REVIEWER_PREFIX[reviewer] ?? "FND"}-${String(findings.length + 1).padStart(3, "0")}`;
    if (!f.file || !f.line || !f.severity || !f.issue) {
      current = null;
      currentField = null;
      return;
    }
    const parsedLine = parseLine(String(f.line));
    f.lineStart = parsedLine.start;
    f.lineEnd = parsedLine.end;
    f.category = f.category ?? "unknown";
    f.rule = f.rule ?? "unknown";
    f.evidence = f.evidence ?? "";
    f.proposedFix = f.proposedFix ?? "";
    f.reviewer = reviewer;
    findings.push(f);
    current = null;
    currentField = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^FINDINGS:\s*$/i.test(line.trim())) {
      inFindings = true;
      continue;
    }
    if (/^NESSUNA VIOLAZIONE\s*$/i.test(line.trim())) {
      sawNoViolation = true;
      continue;
    }
    if (!inFindings) continue;
    if (line.trim().startsWith("```")) {
      close();
      continue;
    }

    const idMatch = line.match(/^\s*-\s+id:\s*(.+)\s*$/i);
    if (idMatch) {
      close();
      current = { id: idMatch[1].trim() } as Partial<Finding>;
      currentField = "id";
      continue;
    }

    const fieldMatch = line.match(/^\s*(file|line|severity|category|rule|issue|evidence|proposed_fix):\s*(.*)\s*$/i);
    if (fieldMatch && current) {
      const rawKey = fieldMatch[1].toLowerCase();
      const key = (rawKey === "proposed_fix" ? "proposedFix" : rawKey) as keyof Finding;
      const value = fieldMatch[2].trim();
      (current as any)[key] = value;
      currentField = key;
      continue;
    }

    if (/^NOTES:/i.test(line.trim())) {
      close();
      break;
    }

    if (current && currentField && line.trim()) {
      (current as any)[currentField] = `${(current as any)[currentField]} ${line.trim()}`.trim();
    }
  }
  close();

  for (const f of findings) {
    if (!SEVERITY_ORDER.includes(String(f.severity).toUpperCase() as Severity)) {
      return { findings: [], parseError: `gravita non riconosciuta per ${f.id}: ${f.severity}` };
    }
    f.severity = String(f.severity).toUpperCase() as Severity;
  }

  if (findings.length === 0 && !sawNoViolation) {
    return { findings: [], parseError: "blocco FINDINGS non riconoscibile" };
  }
  return { findings };
}

function rangesOverlap(a: Finding, b: Finding, slack = 3): boolean {
  if (a.lineStart == null || b.lineStart == null) return false;
  const aStart = a.lineStart;
  const aEnd = a.lineEnd ?? a.lineStart;
  const bStart = b.lineStart;
  const bEnd = b.lineEnd ?? b.lineStart;
  return aStart - slack <= bEnd && bStart - slack <= aEnd;
}

function sameDefect(a: Finding, b: Finding): boolean {
  if (normalizeFile(a.file) !== normalizeFile(b.file)) return false;
  if (!rangesOverlap(a, b)) return false;

  const textSimilarity = similarity(`${a.issue} ${a.evidence}`, `${b.issue} ${b.evidence}`);
  if (a.rule && b.rule && a.rule.toLowerCase() === b.rule.toLowerCase()) return true;
  if (a.category && b.category && a.category.toLowerCase() === b.category.toLowerCase() && textSimilarity >= 0.2) {
    return true;
  }

  const sharedCode = [...codeTokens(`${a.issue} ${a.evidence} ${a.rule}`)]
    .filter((token) => codeTokens(`${b.issue} ${b.evidence} ${b.rule}`).has(token));
  if (sharedCode.length > 0 && textSimilarity >= 0.15) return true;

  return textSimilarity >= 0.4;
}

function groupFindings(findings: Finding[]): Finding[][] {
  const groups: Finding[][] = [];
  for (const finding of findings) {
    let target: Finding[] | null = null;
    for (const group of groups) {
      const sameReviewerAlready = group.some((other) => other.reviewer === finding.reviewer);
      const matchesOtherReviewer = group.some(
        (other) => other.reviewer !== finding.reviewer && sameDefect(other, finding),
      );
      if (!sameReviewerAlready && matchesOtherReviewer) {
        target = group;
        break;
      }
    }
    if (target) target.push(finding);
    else groups.push([finding]);
  }
  return groups;
}

function consolidate(groups: Finding[][]): any[] {
  return groups.map((group, index) => {
    const sorted = [...group].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    const primary = sorted[0];
    const severities = [...new Set(group.map((f) => f.severity))]
      .sort((a, b) => severityRank(b) - severityRank(a)) as Severity[];
    const starts = group.map((f) => f.lineStart).filter((n): n is number => n != null);
    const ends = group.map((f) => f.lineEnd ?? f.lineStart).filter((n): n is number => n != null);
    const lineStart = starts.length ? Math.min(...starts) : null;
    const lineEnd = ends.length ? Math.max(...ends) : null;
    const line = lineStart == null ? primary.line : lineStart === lineEnd ? String(lineStart) : `${lineStart}-${lineEnd}`;
    return {
      id: `FND-${String(index + 1).padStart(3, "0")}`,
      file: primary.file,
      line,
      lineStart,
      lineEnd,
      severity: severities[0],
      gateSeverity: severities[0],
      severities,
      severityConflict: severities.length > 1,
      category: primary.category,
      rule: primary.rule,
      issue: primary.issue,
      evidence: primary.evidence,
      proposedFix: primary.proposedFix,
      reviewers: [...new Set(group.map((f) => f.reviewer))],
      sources: group.map((f) => ({
        reviewer: f.reviewer,
        id: f.id,
        severity: f.severity,
        category: f.category,
        rule: f.rule,
        issue: f.issue,
        evidence: f.evidence,
        proposedFix: f.proposedFix,
      })),
    };
  });
}

function md(value: unknown): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function formatUsd(value: number): string {
  return `${value.toFixed(4)} USD`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function renderMarkdown(report: any): string {
  const out: string[] = [];
  out.push(`# Code Review Suite — LipariBank`);
  out.push("");
  out.push(`- Run: \`${report.run.id}\``);
  out.push(`- Target: \`${report.run.target ?? "(diff)"}\`${report.run.diff ? ` — diff rispetto a \`${report.run.diff}\`` : ""}`);
  out.push(`- Modello: \`${report.run.model ?? "(default OpenCode)"}\``);
  out.push(`- Avvio: ${report.run.startedAt}`);
  out.push(`- Durata totale: ${(report.run.durationMs / 1000).toFixed(1)} s`);
  out.push(`- Esito: **${report.outcome.toUpperCase()}**`);
  out.push(`- Findings: **${report.summary.findingsTotal}** totali, **${report.summary.findingsUnique}** unici, ${report.summary.duplicatesRemoved} duplicati riconciliati`);
  out.push(`- Conflitti di gravita: **${report.summary.conflicts}**`);
  out.push("");

  out.push("## Parallelismo");
  out.push("");
  out.push(`- Reviewer avviati: ${report.parallelism.startedSessions}/${report.parallelism.reviewerCount}`);
  out.push(`- Scarto massimo fra gli avvii: ${report.parallelism.maxStartSkewMs} ms`);
  out.push(`- Coppie sovrapposte: ${report.parallelism.overlappingPairs}/${report.parallelism.totalPairs}`);
  out.push(`- Sovrapposizione reale: **${report.parallelism.overlap ? "si" : "no"}**`);
  out.push("");
  out.push("| Reviewer | Stato | Inizio | Fine | Durata | Token | Costo provider |");
  out.push("|---|---|---|---|---:|---:|---:|");
  for (const r of report.reviewers) {
    out.push(`| ${md(r.reviewer)} | ${md(r.status)} | ${md(r.startedAt)} | ${md(r.finishedAt)} | ${(r.durationMs / 1000).toFixed(1)} s | ${formatNumber(r.usage.total)} | ${formatUsd(r.usage.cost)} |`);
  }
  out.push("");

  out.push("## Budget");
  out.push("");
  out.push(`- Tempo: ${(report.budget.used.seconds).toFixed(1)} s / ${report.budget.limits.seconds || "nessun tetto"} s`);
  out.push(`- Token: ${formatNumber(report.budget.used.tokens)} / ${report.budget.limits.tokens ? formatNumber(report.budget.limits.tokens) : "nessun tetto"}`);
  out.push(`- Costo provider: ${formatUsd(report.budget.used.providerCostUsd)}`);
  out.push(`- Costo stimato: ${formatUsd(report.budget.used.estimatedCostUsd)}`);
  out.push(`- Costo effettivo (max): ${formatUsd(report.budget.used.effectiveCostUsd)} / ${report.budget.limits.costUsd ? formatUsd(report.budget.limits.costUsd) : "nessun tetto"}`);
  out.push(`- Stato: **${report.budget.status}**`);
  out.push("");

  out.push("## Riepilogo per gravita (unici)");
  out.push("");
  out.push("| Gravita | Conteggio |");
  out.push("|---|---:|");
  for (const severity of [...SEVERITY_ORDER].reverse()) {
    out.push(`| ${severity} | ${report.summary.bySeverity[severity] ?? 0} |`);
  }
  out.push("");

  const failed = report.reviewers.filter((r: any) => r.status !== "ok");
  out.push("## Reviewer falliti o non interpretabili");
  out.push("");
  if (failed.length === 0) {
    out.push("Nessuno: tutti i reviewer hanno risposto e l'output e' stato interpretato.");
  } else {
    for (const r of failed) {
      out.push(`### ${r.reviewer} — ${r.status}`);
      out.push("");
      out.push(`- Motivo: ${md(r.error ?? r.parseError ?? "non specificato")}`);
      if (r.text) {
        out.push("");
        out.push("Output grezzo (per non perdere informazione):");
        out.push("");
        out.push("```text");
        out.push(r.text.slice(0, 4000));
        out.push("```");
      }
      out.push("");
    }
  }
  out.push("");

  out.push("## Findings consolidati");
  out.push("");
  if (report.findings.length === 0) {
    out.push("Nessun rilievo.");
  } else {
    for (const f of report.findings) {
      out.push(`### [${f.gateSeverity}] ${f.id} — ${md(f.issue)}`);
      out.push("");
      out.push(`- File: \`${f.file}\``);
      out.push(`- Riga: ${f.line}`);
      out.push(`- Gravita gate: **${f.gateSeverity}**${f.severityConflict ? ` — **CONFLITTO**: ${f.severities.join(" / ")}` : ""}`);
      out.push(`- Reviewer: ${f.reviewers.join(", ")}`);
      out.push(`- Categoria: ${f.category}`);
      out.push(`- Regola: ${f.rule}`);
      out.push(`- Evidenza: ${md(f.evidence)}`);
      out.push(`- Correzione proposta (non applicata): ${md(f.proposedFix)}`);
      if (f.sources.length > 1) {
        out.push("- Sorgenti:");
        for (const source of f.sources) {
          out.push(`  - ${source.reviewer} (${source.severity}, ${source.id}): ${md(source.issue)}`);
        }
      }
      out.push("");
    }
  }
  out.push("");

  out.push("## Dati machine-readable");
  out.push("");
  out.push("Il file `report.json` contiene gli stessi dati in forma consumabile da una pipeline: `summary`, `budget`, `reviewers`, `findings` con `gateSeverity`, `severities`, `severityConflict`, `sources`.");
  out.push("");
  return out.join("\n");
}

function buildPrompt(reviewer: string, args: Args): string {
  const target = args.diff
    ? `il diff git rispetto a ${args.diff}. Usa \`git diff ${args.diff}\` per leggerlo.`
    : `\`${args.target}\`.`;
  return [
    `Esegui la review del target: ${target}`,
    `Sei il reviewer ${reviewer}: resta nel tuo perimetro e non riportare problemi che appartengono a un'altra lente.`,
    `Carica la skill review-findings-format e restituisci SOLO il blocco nel formato richiesto, senza testo fuori dal blocco.`,
    `Se non trovi violazioni, scrivi esattamente NESSUNA VIOLAZIONE.`,
    `Non modificare file. Usa solo strumenti di lettura; se serve, git status/diff/log.`,
  ].join("\n");
}

function reviewerMissing(reviewer: string): string | null {
  const path = join(AGENTS_DIR, `${reviewer}.md`);
  if (!existsSync(path)) return `agent non trovato: ${relative(ROOT, path)}`;
  return null;
}

function reviewerWritable(reviewer: string): string | null {
  const path = join(AGENTS_DIR, `${reviewer}.md`);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf8");
  if (!/permission:[\s\S]*?edit:\s*deny/i.test(content)) {
    return `agent scrivibile: ${relative(ROOT, path)} non ha permission.edit: deny`;
  }
  return null;
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv);
  } catch (error: any) {
    console.error(`ERRORE: ${error?.message ?? error}`);
    console.error(HELP);
    return 4;
  }

  if (args.help) {
    console.log(HELP);
    return 0;
  }

  process.chdir(ROOT);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = args.outDir
    ? (isAbsolute(args.outDir) ? args.outDir : join(ROOT, args.outDir))
    : join(ROOT, "docs", "review-runs", runId);
  const logPath = join(outDir, "run.log");
  const logLines: string[] = [];

  const log = (message: string) => {
    const line = `[${new Date().toISOString()}] ${message}`;
    logLines.push(line);
    appendFileSync(logPath, `${line}\n`, "utf8");
    console.error(line);
  };

  const requestedReviewers = args.reviewers;
  const missing = new Map<string, string>();
  for (const reviewer of requestedReviewers) {
    const reason = reviewerMissing(reviewer);
    if (reason) missing.set(reviewer, reason);
    const writable = reviewerWritable(reviewer);
    if (writable) {
      console.error(`ERRORE: ${writable}. La suite non parte con un reviewer che puo' scrivere.`);
      return 4;
    }
  }

  if (args.diff) {
    try {
      execFileSync("git", ["rev-parse", "--verify", `${args.diff}^{commit}`], { cwd: ROOT, stdio: "ignore" });
    } catch {
      console.error(`ERRORE: diff non valido o git non disponibile: ${args.diff}`);
      return 4;
    }
  } else if (args.target) {
    const targetPath = isAbsolute(args.target) ? args.target : join(ROOT, args.target);
    if (!existsSync(targetPath)) {
      console.error(`ERRORE: target inesistente: ${args.target}`);
      return 4;
    }
  }

  mkdirSync(outDir, { recursive: true });
  log(`RUN ${runId} target=${args.target ?? "(diff)"} diff=${args.diff ?? "-"} reviewers=${requestedReviewers.join(",")}`);
  log(`BUDGET seconds=${args.maxSeconds || "unlimited"} tokens=${args.maxTokens || "unlimited"} costUsd=${args.maxCostUsd || "unlimited"}`);

  let server: any = null;
  let client: any = null;
  let eventAbort: AbortController | null = null;
  let eventTask: Promise<void> | null = null;
  const abortController = new AbortController();
  let abortReason: string | null = null;
  const activeSessions = new Set<string>();
  const eventUsage = new Map<string, Usage>();
  const runStartedAt = Date.now();
  let timer: any = null;

  const totalEventUsage = () => sumUsage([...eventUsage.values()]);

  const checkBudget = () => {
    if (abortReason) return;
    const usage = totalEventUsage();
    const seconds = (Date.now() - runStartedAt) / 1000;
    if (args.maxSeconds > 0 && seconds > args.maxSeconds) return abortAll("time");
    if (args.maxTokens > 0 && usage.total > args.maxTokens) return abortAll("tokens");
    if (args.maxCostUsd > 0 && effectiveCost(usage, args) > args.maxCostUsd) return abortAll("cost");
  };

  const abortAll = (reason: string) => {
    if (abortReason) return;
    abortReason = reason;
    log(`BUDGET EXCEEDED ${reason}`);
    abortController.abort();
    for (const id of activeSessions) {
      Promise.resolve(client?.session?.abort?.({ path: { id } })).catch(() => {});
    }
  };

  const collectSessionUsage = async (sessionId: string): Promise<Usage> => {
    const response = await client.session.messages({ path: { id: sessionId }, query: { directory: ROOT } });
    const messages = (response as any)?.data ?? response;
    const usage = emptyUsage();
    for (const message of messages ?? []) {
      if (message?.info?.role === "assistant") addUsage(usage, usageFromInfo(message.info));
    }
    return usage;
  };

  const runReviewer = async (reviewer: string): Promise<ReviewerResult> => {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    log(`START ${reviewer}`);
    if (missing.has(reviewer)) {
      const finishedAt = new Date().toISOString();
      const error = missing.get(reviewer)!;
      log(`FAIL ${reviewer} ${error}`);
      return {
        reviewer, status: "failed", startedAt, finishedAt, durationMs: Date.now() - startedAtMs,
        sessionId: null, usage: emptyUsage(), text: "", findings: [], error,
      };
    }

    let sessionId: string | null = null;
    try {
      const created = await client.session.create({ body: { title: `review-${reviewer}` }, query: { directory: ROOT } });
      const session = (created as any)?.data ?? created;
      sessionId = session.id;
      activeSessions.add(sessionId);

      const body: any = {
        agent: reviewer,
        parts: [{ type: "text", text: buildPrompt(reviewer, args) }],
      };
      if (args.model) {
        const [providerID, modelID] = args.model.split("/");
        if (providerID && modelID) body.model = { providerID, modelID };
      }

      const response = await client.session.prompt({
        path: { id: sessionId },
        body,
        signal: abortController.signal,
      });
      const output = (response as any)?.data ?? response;
      const info = output?.info;
      if (info?.error) throw new Error(`${info.error?.name ?? "errore"}: ${info.error?.data?.message ?? JSON.stringify(info.error)}`);

      let usage = info ? usageFromInfo(info) : emptyUsage();
      try {
        const collected = await collectSessionUsage(sessionId);
        if (collected.total > 0 || collected.cost > 0) usage = collected;
      } catch {}

      const text = extractText(output?.parts ?? []);
      const parsed = parseReview(text, reviewer);
      const finishedAt = new Date().toISOString();
      const status: ReviewerStatus = parsed.parseError ? "unparseable" : "ok";
      log(`END ${reviewer} status=${status} findings=${parsed.findings.length} tokens=${usage.total} cost=${usage.cost}`);
      return {
        reviewer, status, startedAt, finishedAt, durationMs: Date.now() - startedAtMs,
        sessionId, usage, text, findings: parsed.findings, parseError: parsed.parseError,
      };
    } catch (error: any) {
      const status: ReviewerStatus = abortController.signal.aborted ? "budget" : "failed";
      let message = error?.message ?? String(error);
      if (status === "budget") message = `interrotto: ${abortReason ?? "budget"}`;

      let usage = emptyUsage();
      let text = "";
      if (sessionId) {
        try {
          usage = await collectSessionUsage(sessionId);
        } catch {}
        try {
          const response = await client.session.messages({ path: { id: sessionId }, query: { directory: ROOT } });
          const messages = (response as any)?.data ?? response;
          text = extractTextFromMessages(messages);
        } catch {}
      }

      const finishedAt = new Date().toISOString();
      log(`FAIL ${reviewer} ${status}: ${message}`);
      return {
        reviewer, status, startedAt, finishedAt, durationMs: Date.now() - startedAtMs,
        sessionId, usage, text, findings: [], error: message,
      };
    } finally {
      if (sessionId) activeSessions.delete(sessionId);
    }
  };

  try {
    const opened = await createOpencode({ port: 0 });
    client = opened.client;
    server = opened.server;
    log(`SERVER ${server.url}`);

    const startEvents = async () => {
      let ready: (() => void) | null = null;
      const readyPromise = new Promise<void>((resolveReady) => { ready = resolveReady; });
      eventAbort = new AbortController();
      eventTask = (async () => {
        try {
          const subscription = await client.event.subscribe({
            query: { directory: ROOT },
            signal: eventAbort!.signal,
          });
          const stream = (subscription as any)?.data?.stream ?? (subscription as any)?.stream;
          if (!stream) {
            log("EVENTI non disponibili: il budget token/costo si controlla a ogni reviewer completato");
            ready?.();
            return;
          }
          ready?.();
          for await (const event of stream) {
            if (event?.type === "message.updated" && event?.properties?.info?.role === "assistant") {
              const info = event.properties.info;
              eventUsage.set(info.id, usageFromInfo(info));
              checkBudget();
            }
          }
        } catch (error: any) {
          if (!eventAbort?.signal.aborted) log(`EVENTI errore: ${error?.message ?? error}`);
          ready?.();
        }
      })();
      await Promise.race([readyPromise, new Promise((resolveWait) => setTimeout(resolveWait, 750))]);
      return readyPromise;
    };

    await startEvents();
    if (args.maxSeconds > 0) timer = setTimeout(() => abortAll("time"), args.maxSeconds * 1000);

    const results = await Promise.all(requestedReviewers.map((reviewer) => runReviewer(reviewer)));
    if (timer) clearTimeout(timer);
    eventAbort?.abort();

    const rawDir = join(outDir, "raw");
    mkdirSync(rawDir, { recursive: true });
    for (const result of results) {
      writeFileSync(join(rawDir, `${result.reviewer}.txt`), result.text, "utf8");
    }

    const allFindings = results.flatMap((result) => result.findings);
    const groups = groupFindings(allFindings);
    const findings = consolidate(groups);
    const totalUsage = sumUsage(results.map((result) => result.usage));
    const providerCostUsd = totalUsage.cost;
    const estimatedCostUsd = estimatedCost(totalUsage, args);
    const effectiveCostUsd = Math.max(providerCostUsd, estimatedCostUsd);
    const durationMs = Date.now() - runStartedAt;
    const durationSeconds = durationMs / 1000;

    let budgetStatus = "ok";
    if (abortReason) budgetStatus = `exceeded_${abortReason}`;
    else if (args.maxSeconds > 0 && durationSeconds > args.maxSeconds) budgetStatus = "exceeded_time";
    else if (args.maxTokens > 0 && totalUsage.total > args.maxTokens) budgetStatus = "exceeded_tokens";
    else if (args.maxCostUsd > 0 && effectiveCostUsd > args.maxCostUsd) budgetStatus = "exceeded_cost";

    const ran = results.filter((result) => result.sessionId != null);
    const startTimes = ran.map((result) => Date.parse(result.startedAt));
    const endTimes = ran.map((result) => Date.parse(result.finishedAt));
    const firstStart = startTimes.length ? Math.min(...startTimes) : null;
    const lastStart = startTimes.length ? Math.max(...startTimes) : null;
    const firstEnd = endTimes.length ? Math.min(...endTimes) : null;
    const lastEnd = endTimes.length ? Math.max(...endTimes) : null;
    let overlappingPairs = 0;
    let totalPairs = 0;
    for (let i = 0; i < ran.length; i++) {
      for (let j = i + 1; j < ran.length; j++) {
        totalPairs++;
        const aStart = Date.parse(ran[i].startedAt);
        const aEnd = Date.parse(ran[i].finishedAt);
        const bStart = Date.parse(ran[j].startedAt);
        const bEnd = Date.parse(ran[j].finishedAt);
        if (aStart < bEnd && bStart < aEnd) overlappingPairs++;
      }
    }

    const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const finding of findings) bySeverity[finding.gateSeverity] = (bySeverity[finding.gateSeverity] ?? 0) + 1;
    const conflicts = findings.filter((finding) => finding.severityConflict).length;

    const failedReviewers = results.filter((result) => result.status !== "ok");
    let outcome = "ok";
    let exitCode = 0;
    if (budgetStatus !== "ok") {
      outcome = "budget_exceeded";
      exitCode = 2;
    } else if (failedReviewers.length > 0) {
      outcome = "reviewer_failed";
      exitCode = 3;
    } else if (findings.some((finding) => severityRank(finding.gateSeverity) >= severityRank(args.failOn))) {
      outcome = "gate_failed";
      exitCode = 1;
    }

    const report = {
      schemaVersion: "1.0",
      run: {
        id: runId,
        target: args.target,
        diff: args.diff,
        startedAt: new Date(runStartedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs,
        command: process.argv.join(" "),
        model: args.model,
        failOn: args.failOn,
      },
      outcome,
      exitCode,
      parallelism: {
        reviewerCount: results.length,
        startedSessions: ran.length,
        maxStartSkewMs: firstStart != null && lastStart != null ? lastStart - firstStart : 0,
        firstStart: firstStart != null ? new Date(firstStart).toISOString() : null,
        lastStart: lastStart != null ? new Date(lastStart).toISOString() : null,
        firstEnd: firstEnd != null ? new Date(firstEnd).toISOString() : null,
        lastEnd: lastEnd != null ? new Date(lastEnd).toISOString() : null,
        overlappingPairs,
        totalPairs,
        overlap: totalPairs > 0 ? overlappingPairs === totalPairs : false,
      },
      budget: {
        limits: { seconds: args.maxSeconds, tokens: args.maxTokens, costUsd: args.maxCostUsd },
        used: { seconds: durationSeconds, tokens: totalUsage.total, providerCostUsd, estimatedCostUsd, effectiveCostUsd },
        status: budgetStatus,
        exceededBy: abortReason ?? (budgetStatus === "ok" ? null : budgetStatus.replace("exceeded_", "")),
        rates: { inputUsdPerMTok: args.inputUsdPerMTok, outputUsdPerMTok: args.outputUsdPerMTok },
      },
      reviewers: results.map((result) => ({
        reviewer: result.reviewer,
        status: result.status,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        durationMs: result.durationMs,
        sessionId: result.sessionId,
        usage: result.usage,
        findingsCount: result.findings.length,
        error: result.error ?? null,
        parseError: result.parseError ?? null,
        rawTextFile: relative(ROOT, join(rawDir, `${result.reviewer}.txt`)),
        text: result.status === "ok" ? undefined : result.text.slice(0, 4000),
      })),
      summary: {
        findingsTotal: allFindings.length,
        findingsUnique: findings.length,
        duplicatesRemoved: allFindings.length - findings.length,
        conflicts,
        bySeverity,
        byReviewer: results.map((result) => ({ reviewer: result.reviewer, status: result.status, findings: result.findings.length })),
      },
      findings,
    };

    const markdown = renderMarkdown(report);
    writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
    writeFileSync(join(outDir, "report.md"), markdown, "utf8");
    log(`REPORT ${relative(ROOT, join(outDir, "report.md"))} exit=${exitCode} findings=${findings.length} tokens=${totalUsage.total} cost=${providerCostUsd}`);

    console.log(markdown);
    console.error(`\nReport: ${join(outDir, "report.md")}`);
    console.error(`JSON:   ${join(outDir, "report.json")}`);
    console.error(`Log:    ${logPath}`);
    return exitCode;
  } catch (error: any) {
    log(`FATAL ${error?.stack ?? error}`);
    console.error(`ERRORE FATALE: ${error?.message ?? error}`);
    return 4;
  } finally {
    if (timer) clearTimeout(timer);
    eventAbort?.abort();
    if (eventTask) await eventTask.catch(() => {});
    try {
      server?.close?.();
    } catch {}
  }
}

main().then((code) => {
  process.exitCode = code;
});
