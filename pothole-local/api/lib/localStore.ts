import fs from "fs";
import path from "path";
import { sanitizeFilename } from "@/lib/http";
import type { CreateReportInput, PotholeReport, UpdateReportInput } from "@/lib/types";

const REPORTS_PATH = path.join(process.cwd(), "data", "local-reports.json");
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export function isLocalStorageMode(): boolean {
  return process.env.LOCAL_STORAGE_MODE === "1";
}

function ensureLocalFiles() {
  fs.mkdirSync(path.dirname(REPORTS_PATH), { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(REPORTS_PATH)) {
    fs.writeFileSync(REPORTS_PATH, "[]\n", "utf-8");
  }
}

function readReports(): PotholeReport[] {
  ensureLocalFiles();
  const raw = fs.readFileSync(REPORTS_PATH, "utf-8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as PotholeReport[];
}

function writeReports(reports: PotholeReport[]) {
  ensureLocalFiles();
  fs.writeFileSync(REPORTS_PATH, `${JSON.stringify(reports, null, 2)}\n`, "utf-8");
}

function originFromRequest(request: Request): string {
  const configured = process.env.LOCAL_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    return configured;
  }

  const url = new URL(request.url);
  if (url.hostname === "0.0.0.0") {
    return `${url.protocol}//localhost:${url.port}`;
  }
  return `${url.protocol}//${url.host}`;
}

export async function uploadLocalImage(
  file: File,
  prefix: string,
  request: Request
): Promise<string> {
  ensureLocalFiles();
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length <= 0) {
    throw new Error("Uploaded file is empty.");
  }

  const safeName = sanitizeFilename(file.name || "upload.jpg");
  const objectName = `${prefix}-${crypto.randomUUID()}-${safeName}`;
  const filePath = path.join(UPLOAD_DIR, objectName);
  fs.writeFileSync(filePath, bytes);
  return `${originFromRequest(request)}/uploads/${objectName}`;
}

export function listLocalReports(): PotholeReport[] {
  return readReports().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function findLocalReportByCaptureId(captureId: string): PotholeReport | null {
  return (
    readReports().find((report) => {
      const metadata = report.metadata ?? {};
      return metadata.capture_id === captureId;
    }) ?? null
  );
}

export function getLocalReport(id: string): PotholeReport | null {
  return readReports().find((report) => report.id === id) ?? null;
}

export function createLocalReport(input: CreateReportInput): PotholeReport {
  const report: PotholeReport = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    image_url: input.image_url,
    annotated_image_url: input.annotated_image_url ?? null,
    metadata: input.metadata ?? {},
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    severity: input.severity ?? null,
    status: input.status ?? "pending",
    notes: input.notes ?? null,
  };

  const reports = readReports();
  reports.push(report);
  writeReports(reports);
  return report;
}

export function updateLocalReport(
  id: string,
  updates: UpdateReportInput
): PotholeReport | null {
  const reports = readReports();
  const index = reports.findIndex((report) => report.id === id);
  if (index === -1) return null;

  reports[index] = { ...reports[index], ...updates };
  writeReports(reports);
  return reports[index];
}

export function deleteLocalReport(id: string): boolean {
  const reports = readReports();
  const nextReports = reports.filter((report) => report.id !== id);
  if (nextReports.length === reports.length) return false;
  writeReports(nextReports);
  return true;
}
