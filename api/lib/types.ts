export type ReportSeverity = "critical" | "high" | "medium" | "low";
export type ReportStatus = "pending" | "in_progress" | "repaired";

export type PotholeReport = {
  id: string;
  created_at: string;
  image_url: string;
  annotated_image_url: string | null;
  metadata: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  severity: ReportSeverity | null;
  status: ReportStatus;
  notes: string | null;
};

export type CreateReportInput = {
  image_url: string;
  annotated_image_url?: string | null;
  metadata?: Record<string, unknown>;
  latitude?: number | null;
  longitude?: number | null;
  severity?: ReportSeverity | null;
  status?: ReportStatus;
  notes?: string | null;
};

export type UpdateReportInput = Partial<
  Omit<PotholeReport, "id" | "created_at">
>;
