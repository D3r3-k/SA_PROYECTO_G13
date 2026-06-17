import { Router, Request, Response } from "express";
import { adminMiddleware, auditMiddleware, reportMiddleware } from "../middleware/admin.middleware";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { callSubscriptionMethod } from "../grpc/subscription.client";
import { callCatalogMethod } from "../grpc/catalog.client";
import { callIdentityMethod } from "../grpc/identity.client";
import { callEngagementMethod } from "../grpc/engagement.client";

export const adminRoutes = Router();

type Plan = {
  id: number;
  name: string;
  price_usd: number;
  is_active: boolean;
};

type ListPlansResponse = {
  success: boolean;
  message: string;
  plans: Plan[];
};

type UpdatePlanResponse = {
  success: boolean;
  message: string;
  plan?: Plan;
};

type SyncResponse = {
  success: boolean;
  message: string;
  contents_synced?: number;
  episodes_synced?: number;
  provider?: string;
};

type CreateContentResponse = {
  success: boolean;
  message: string;
  content_id: string;
  episodes: Array<{
    episode_id: string;
    season_number: number;
    episode_number: number;
    title: string;
  }>;
};

type UploadURLResponse = {
  success: boolean;
  message: string;
  upload_url: string;
  object_key: string;
  expires_in_minutes: number;
};

type BasicResponse = {
  success: boolean;
  message: string;
};

type AuditLogItem = {
  service: string;
  audit_id: string;
  actor_user_id: string;
  actor_email: string;
  action: string;
  table_name: string;
  record_id: string;
  old_state_json: string;
  new_state_json: string;
  created_at: string;
};

type AuditResponse = {
  success: boolean;
  message: string;
  items: AuditLogItem[];
};

type AuditFilters = {
  table_name: string;
  actor_user_id: string;
  action: string;
  from: string;
  to: string;
  limit: number;
  offset: number;
};

function logAdminError(message: string, error: unknown) {
  const details = error instanceof Error ? error.message : String(error);
  console.error(`[admin.routes.ts] Error: ${message}: ${details}`);
}

function actorPayload(req: AuthenticatedRequest) {
  return {
    actor_user_id: req.user?.user_id ?? "",
    actor_email: req.user?.email ?? ""
  };
}

function parsePositiveInt(value: unknown, fallback: number, max: number) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return fallback;
  }
  return Math.min(n, max);
}

function contentWritePayload(req: AuthenticatedRequest, contentId?: string) {
  const body = req.body ?? {};
  return {
    content_id: contentId ?? String(body.contentId ?? body.content_id ?? "").trim(),
    type: String(body.type ?? "").trim(),
    title: String(body.title ?? "").trim(),
    overview: String(body.overview ?? "").trim(),
    release_date: String(body.releaseDate ?? body.release_date ?? "").trim(),
    available_from: String(body.availableFrom ?? body.available_from ?? "").trim(),
    genres: Array.isArray(body.genres) ? body.genres.map(String) : [],
    cast: Array.isArray(body.cast)
      ? body.cast.map((item: Record<string, unknown>, index: number) => ({
          actor_name: String(item.actorName ?? item.actor_name ?? "").trim(),
          character_name: String(item.characterName ?? item.character_name ?? "").trim(),
          order_index: Number(item.orderIndex ?? item.order_index ?? index)
        }))
      : [],
    episodes: Array.isArray(body.episodes)
      ? body.episodes.map((item: Record<string, unknown>) => ({
          season_number: Number(item.seasonNumber ?? item.season_number ?? 1),
          episode_number: Number(item.episodeNumber ?? item.episode_number ?? 0),
          title: String(item.title ?? "").trim(),
          overview: String(item.overview ?? "").trim(),
          runtime_minutes: Number(item.runtimeMinutes ?? item.runtime_minutes ?? 0)
        }))
      : [],
    ...actorPayload(req)
  };
}

function validateContentPayload(payload: ReturnType<typeof contentWritePayload>, requireId: boolean) {
  if (requireId && !payload.content_id) {
    return "content_id is required";
  }
  if (payload.type !== "movie" && payload.type !== "series") {
    return "type must be movie or series";
  }
  if (!payload.title) {
    return "title is required";
  }
  return "";
}

adminRoutes.get("/plans", adminMiddleware, async (_req: Request, res: Response) => {
  try {
    const response = await callSubscriptionMethod<Record<string, never>, ListPlansResponse>(
      "ListPlans",
      {}
    );
    return res.json(response);
  } catch (error) {
    logAdminError("Admin list plans failed", error);
    return res.status(503).json({ success: false, message: "Subscription Service unavailable" });
  }
});

adminRoutes.patch("/plans/:planId", adminMiddleware, async (req: Request, res: Response) => {
  const planId = Number(req.params.planId);
  const { name, price_usd } = req.body;

  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, message: "planId must be a positive integer" });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ success: false, message: "name is required" });
  }
  if (typeof price_usd !== "number" || price_usd < 0) {
    return res.status(400).json({ success: false, message: "price_usd must be a non-negative number" });
  }

  try {
    const response = await callSubscriptionMethod<
      { id: number; name: string; price_usd: number; actor_user_id: string; actor_email: string },
      UpdatePlanResponse
    >("UpdatePlan", { id: planId, name: name.trim(), price_usd, ...actorPayload(req as AuthenticatedRequest) });

    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.json(response);
  } catch (error) {
    logAdminError("Admin update plan failed", error);
    return res.status(503).json({ success: false, message: "Subscription Service unavailable" });
  }
});

adminRoutes.post("/catalog/sync", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const response = await callCatalogMethod<Record<string, unknown>, SyncResponse>(
      "SyncMinimumCatalog",
      { force: Boolean(req.body?.force) }
    );

    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.status(201).json(response);
  } catch (error) {
    logAdminError("Admin sync catalog failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

<<<<<<< Updated upstream
adminRoutes.get("/catalog/content", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const response = await callCatalogMethod<Record<string, unknown>, { success: boolean; message: string; items: unknown[] }>(
      "ListAdminContent",
      {
        type: String(req.query.type ?? "").trim(),
        status: String(req.query.status ?? "all").trim(),
        query: String(req.query.query ?? "").trim(),
        limit: parsePositiveInt(req.query.limit, 20, 100),
        offset: Number(req.query.offset ?? 0)
      }
    );
    return res.json(response);
  } catch (error) {
    logAdminError("Admin list content failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
=======
adminRoutes.get("/catalog/list", adminMiddleware, async (_req, res) => {
  try {
    const response = await callCatalogMethod<
      Record<string, unknown>,
      { success: boolean; message: string; items: unknown[] }
    >("ListContent", { type: "", genre: "", limit: 200, offset: 0 });
    return res.json(response);
  } catch (error) {
    logAdminError("Admin list catalog failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

adminRoutes.post("/catalog/content", adminMiddleware, async (req, res) => {
  const body = req.body ?? {};
  const type = String(body.type ?? "").trim();
  const title = String(body.title ?? "").trim();

  if (type !== "movie" && type !== "series") {
    return res.status(400).json({ success: false, message: "type must be movie or series" });
>>>>>>> Stashed changes
  }
});

adminRoutes.post("/catalog/content", adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const payload = contentWritePayload(req);
  const validationMessage = validateContentPayload(payload, false);
  if (validationMessage) {
    return res.status(400).json({ success: false, message: validationMessage });
  }

  try {
    const response = await callCatalogMethod<Record<string, unknown>, CreateContentResponse>(
      "CreateContent",
      payload
    );

    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.status(201).json(response);
  } catch (error) {
    logAdminError("Admin create content failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

adminRoutes.patch("/catalog/content/:contentId", adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const payload = contentWritePayload(req, String(req.params.contentId ?? "").trim());
  const validationMessage = validateContentPayload(payload, true);
  if (validationMessage) {
    return res.status(400).json({ success: false, message: validationMessage });
  }

  try {
    const response = await callCatalogMethod<Record<string, unknown>, BasicResponse>(
      "UpdateContent",
      payload
    );
    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.json(response);
  } catch (error) {
    logAdminError("Admin update content failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

adminRoutes.delete("/catalog/content/:contentId", adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const response = await callCatalogMethod<Record<string, unknown>, BasicResponse>(
      "DeleteContent",
      {
        content_id: String(req.params.contentId ?? "").trim(),
        ...actorPayload(req)
      }
    );
    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.json(response);
  } catch (error) {
    logAdminError("Admin delete content failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

adminRoutes.patch("/catalog/content/:contentId/premiere", adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body ?? {};
  const availableFrom = String(body.availableFrom ?? body.available_from ?? "").trim();
  if (!availableFrom) {
    return res.status(400).json({ success: false, message: "available_from is required" });
  }

  try {
    const response = await callCatalogMethod<Record<string, unknown>, BasicResponse>(
      "SchedulePremiere",
      {
        content_id: String(req.params.contentId ?? "").trim(),
        available_from: availableFrom,
        ...actorPayload(req)
      }
    );
    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.json(response);
  } catch (error) {
    logAdminError("Admin schedule premiere failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

adminRoutes.post("/media/upload-url", adminMiddleware, async (req: Request, res: Response) => {
  const body = req.body ?? {};

  try {
    const response = await callCatalogMethod<Record<string, unknown>, UploadURLResponse>(
      "GenerateUploadUrl",
      {
        content_id: String(body.contentId ?? body.content_id ?? "").trim(),
        episode_id: String(body.episodeId ?? body.episode_id ?? "").trim(),
        media_type: String(body.mediaType ?? body.media_type ?? "").trim(),
        file_name: String(body.fileName ?? body.file_name ?? "").trim(),
        content_type: String(body.contentType ?? body.content_type ?? "").trim(),
        size_bytes: Number(body.sizeBytes ?? body.size_bytes ?? 0)
      }
    );

    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.json(response);
  } catch (error) {
    logAdminError("Admin generate upload url failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

adminRoutes.post("/media/confirm", adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body ?? {};

  try {
    const response = await callCatalogMethod<Record<string, unknown>, BasicResponse>(
      "ConfirmMedia",
      {
        content_id: String(body.contentId ?? body.content_id ?? "").trim(),
        episode_id: String(body.episodeId ?? body.episode_id ?? "").trim(),
        media_type: String(body.mediaType ?? body.media_type ?? "").trim(),
        object_key: String(body.objectKey ?? body.object_key ?? "").trim(),
        content_type: String(body.contentType ?? body.content_type ?? "").trim(),
        ...actorPayload(req)
      }
    );

    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.json(response);
  } catch (error) {
    logAdminError("Admin confirm media failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

adminRoutes.get("/audit", auditMiddleware, async (req: Request, res: Response) => {
  try {
    const service = String(req.query.service ?? "all").trim();
    const items = await collectAuditLogs(service, auditFiltersFromQuery(req.query));
    return res.json({ success: true, message: `audit logs listed: ${items.length} items`, items });
  } catch (error) {
    logAdminError("Admin audit query failed", error);
    return res.status(503).json({ success: false, message: "Audit services unavailable" });
  }
});

adminRoutes.get("/audit.csv", reportMiddleware, async (req: Request, res: Response) => {
  try {
    const service = String(req.query.service ?? "all").trim();
    const items = await collectAuditLogs(service, auditFiltersFromQuery(req.query));
    const csv = auditItemsToCsv(items);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=quetxal-tv-audit.csv");
    return res.send(csv);
  } catch (error) {
    logAdminError("Admin audit CSV failed", error);
    return res.status(503).json({ success: false, message: "Audit services unavailable" });
  }
});

adminRoutes.get("/audit.pdf", reportMiddleware, async (req: Request, res: Response) => {
  try {
    const service = String(req.query.service ?? "all").trim();
    const items = await collectAuditLogs(service, auditFiltersFromQuery(req.query));
    const pdf = auditItemsToPdf(items);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=quetxal-tv-audit.pdf");
    return res.send(pdf);
  } catch (error) {
    logAdminError("Admin audit PDF failed", error);
    return res.status(503).json({ success: false, message: "Audit services unavailable" });
  }
});

function auditFiltersFromQuery(query: Record<string, unknown>): AuditFilters {
  return {
    table_name: String(query.table_name ?? query.tableName ?? "").trim(),
    actor_user_id: String(query.actor_user_id ?? query.actorUserId ?? "").trim(),
    action: String(query.action ?? "").trim(),
    from: String(query.from ?? "").trim(),
    to: String(query.to ?? "").trim(),
    limit: parsePositiveInt(query.limit, 100, 1000),
    offset: Number(query.offset ?? 0)
  };
}

async function collectAuditLogs(service: string, filters: AuditFilters): Promise<AuditLogItem[]> {
  const normalized = service || "all";
  const loaders: Record<string, () => Promise<AuditResponse>> = {
    catalog: () => callCatalogMethod<AuditFilters, AuditResponse>("ListAuditLogs", filters),
    identity: () => callIdentityMethod<AuditFilters, AuditResponse>("ListAuditLogs", filters),
    subscription: () => callSubscriptionMethod<AuditFilters, AuditResponse>("ListAuditLogs", filters),
    engagement: () => callEngagementMethod<AuditFilters, AuditResponse>("ListAuditLogs", filters)
  };

  if (normalized !== "all") {
    const loader = loaders[normalized];
    if (!loader) {
      throw new Error("service must be all, catalog, identity, subscription or engagement");
    }

    const response = await loader();
    if (!response.success) {
      throw new Error(`${normalized} audit failed: ${response.message}`);
    }

    return response.items ?? [];
  }

  const responses = await Promise.all(
    Object.entries(loaders).map(async ([serviceName, loader]) => {
      const response = await loader();

      if (!response.success) {
        throw new Error(`${serviceName} audit failed: ${response.message}`);
      }

      return response;
    })
  );

  return responses.flatMap((response) => response.items ?? []).sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  );
}

function auditItemsToCsv(items: AuditLogItem[]) {
  const headers = [
    "service",
    "audit_id",
    "created_at",
    "actor_user_id",
    "actor_email",
    "action",
    "table_name",
    "record_id",
    "old_state_json",
    "new_state_json"
  ];
  const lines = [headers.join(",")];
  for (const item of items) {
    lines.push(headers.map((key) => csvCell(String(item[key as keyof AuditLogItem] ?? ""))).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function auditItemsToPdf(items: AuditLogItem[]) {
  const rows = items.slice(0, 120).map((item) =>
    `${item.created_at} | ${item.service} | ${item.action} | ${item.table_name} | ${item.actor_email || item.actor_user_id}`
  );
  const lines = ["Quetxal TV - Reporte de auditoria", `Registros: ${items.length}`, "", ...rows];
  return buildSimplePdf(lines);
}

function buildSimplePdf(lines: string[]) {
  const safeLines = lines.map((line) => line.replace(/[()\\]/g, " ").slice(0, 110));
  const content = ["BT", "/F1 10 Tf", "40 780 Td"];
  safeLines.forEach((line, index) => {
    if (index > 0) {
      content.push("0 -14 Td");
    }
    content.push(`(${line}) Tj`);
  });
  content.push("ET");
  const stream = content.join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}
