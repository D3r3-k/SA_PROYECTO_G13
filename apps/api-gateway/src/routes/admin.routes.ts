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
    maturity_rating: String(body.maturityRating ?? body.maturity_rating ?? "ALL").trim(),
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
    const filters = auditFiltersFromQuery(req.query);
    const items = await collectAllAuditLogs(service, filters);
    const pdf = auditItemsToPdf(items, { ...filters, service });
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

function auditLoaders(filters: AuditFilters): Record<string, () => Promise<AuditResponse>> {
  return {
    catalog: () => callCatalogMethod<AuditFilters, AuditResponse>("ListAuditLogs", filters),
    identity: () => callIdentityMethod<AuditFilters, AuditResponse>("ListAuditLogs", filters),
    subscription: () => callSubscriptionMethod<AuditFilters, AuditResponse>("ListAuditLogs", filters),
    engagement: () => callEngagementMethod<AuditFilters, AuditResponse>("ListAuditLogs", filters)
  };
}

function assertAuditResponse(service: string, response: AuditResponse): AuditLogItem[] {
  if (!response.success) {
    throw new Error(`${service} audit failed: ${response.message}`);
  }
  return response.items ?? [];
}

async function collectAuditLogs(service: string, filters: AuditFilters): Promise<AuditLogItem[]> {
  const normalized = service || "all";
  const loaders = auditLoaders(filters);

  if (normalized !== "all") {
    const loader = loaders[normalized];
    if (!loader) {
      throw new Error("service must be all, catalog, identity, subscription or engagement");
    }
    return assertAuditResponse(normalized, await loader());
  }

  const responses = await Promise.all(
    Object.entries(loaders).map(async ([serviceName, loader]) =>
      assertAuditResponse(serviceName, await loader())
    )
  );

  return responses.flat().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function collectAllAuditLogs(service: string, filters: AuditFilters): Promise<AuditLogItem[]> {
  const pageSize = 1000;
  const allItems: AuditLogItem[] = [];
  let offset = 0;

  while (true) {
    const page = await collectAuditLogs(service, { ...filters, limit: pageSize, offset });
    allItems.push(...page);

    if (page.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return allItems.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
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

function auditItemsToPdf(items: AuditLogItem[], filters: AuditFilters & { service: string }) {
  const width = 842;
  const height = 595;
  const margin = 38;
  const contentWidth = width - margin * 2;
  const bottom = 42;
  const topStart = 486;
  const objects: string[] = [];
  const pages: Array<{ pageId: number; contentId: number }> = [];
  const pageStreams: string[] = [];

  const addObject = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  addObject("");
  addObject("");
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  let stream = "";
  let y = topStart;

  const addText = (x: number, yPos: number, size: number, text: string, bold = false) =>
    `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${yPos} Td (${pdfText(text)}) Tj ET\n`;

  const startPage = () => {
    if (stream) pageStreams.push(stream);
    const pageNumber = pageStreams.length + 1;
    stream = "";
    stream += "0.96 0.96 0.96 rg 0 0 842 595 re f\n";
    stream += "0.10 0.14 0.22 rg 0 548 842 47 re f\n";
    stream += "1 1 1 rg\n";
    stream += addText(margin, 567, 16, "Reporte de auditoria", true);
    stream += addText(676, 567, 9, `Pagina ${pageNumber} de {{TOTAL_PAGES}}`);
    stream += "0 0 0 rg\n";
    stream += addText(margin, 528, 8.5, `Modulo consultado: ${serviceLabel(filters.service)}`);
    stream += addText(margin + 205, 528, 8.5, `Tipo de cambio: ${filters.action ? actionLabel(filters.action) : "Todos"}`);
    stream += addText(margin + 410, 528, 8.5, `Tabla filtrada: ${filters.table_name || "Todas"}`);
    stream += addText(margin + 615, 528, 8.5, `Registros incluidos: ${items.length}`);
    stream += addText(margin, 510, 8, `Fecha de generacion: ${formatDate(new Date().toISOString())}`);
    stream += addText(margin, 494, 7.8, "Cada registro indica quien realizo el cambio, donde ocurrio y que informacion fue registrada.");
    stream += "0.82 0.85 0.90 RG 0.7 w 38 484 766 0 l S\n";
    y = topStart;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < bottom) startPage();
  };

  const drawLine = (line: string, x = margin + 14, size = 7.2, bold = false, lineHeight = 9.4) => {
    if (y < bottom) startPage();
    stream += addText(x, y, size, line, bold);
    y -= lineHeight;
  };

  const drawWrapped = (label: string, value: string, x = margin + 14, maxLength = 118) => {
    const prefix = `${label}: `;
    const lines = wrapPdfText(`${prefix}${value}`, maxLength);
    lines.forEach((line, idx) => drawLine(line || " ", idx === 0 ? x : x + 10, 7.1, idx === 0 && line.startsWith(prefix)));
  };

  startPage();

  if (items.length === 0) {
    drawLine("No se encontraron registros con los filtros seleccionados.", margin, 10, true);
  } else {
    items.forEach((item, index) => {
      ensureSpace(130);
      const headerY = y - 2;
      stream += "1 1 1 rg ";
      stream += `${margin} ${headerY - 30} ${contentWidth} 36 re f\n`;
      stream += "0.82 0.85 0.90 RG 0.5 w ";
      stream += `${margin} ${headerY - 30} ${contentWidth} 36 re S\n`;
      stream += "0 0 0 rg\n";
      stream += addText(margin + 9, headerY - 8, 8.8, `Registro ${index + 1} de ${items.length}`, true);
      stream += addText(margin + 120, headerY - 8, 8.2, `Tipo de cambio: ${actionLabel(item.action)}`, true);
      stream += addText(margin + 310, headerY - 8, 8.2, `Modulo: ${serviceLabel(item.service)}`, true);
      stream += addText(margin + 500, headerY - 8, 8.2, `Tabla afectada: ${item.table_name || "Sin tabla"}`, true);
      stream += addText(margin + 9, headerY - 22, 7.4, "Encabezado: resume la accion auditada y permite ubicar rapidamente el registro.");
      y -= 46;

      const user = item.actor_email || item.actor_user_id || "Sistema";
      const record = item.record_id || item.audit_id || "Sin registro asociado";
      drawWrapped("Fecha y hora del cambio", formatDate(item.created_at));
      drawWrapped("Usuario responsable", user);
      drawWrapped("Identificador del registro afectado", record);
      drawWrapped("Id interno de auditoria", item.audit_id || "Sin id de auditoria");
      drawLine("Detalle de la informacion registrada", margin + 14, 7.4, true);
      drawLine("Los bloques siguientes muestran los datos guardados automaticamente por la auditoria.", margin + 14, 6.9);

      auditSectionsForPdf(item).forEach((section) => {
        ensureSpace(50);
        y -= 2;
        drawLine(section.title, margin + 22, 7.3, true);
        wrapPdfText(section.help, 116).forEach((line) => drawLine(line, margin + 32, 6.8));
        wrapPdfText(section.body, 112).forEach((line) => drawLine(line || " ", margin + 32, 6.5));
      });

      y -= 10;
    });
  }

  if (stream) pageStreams.push(stream);
  const totalPages = Math.max(1, pageStreams.length);

  pageStreams.forEach((pageStream) => {
    const finalStream = pageStream.replace(/\{\{TOTAL_PAGES\}\}/g, String(totalPages));
    const contentId = addObject(`<< /Length ${Buffer.byteLength(finalStream)} >>\nstream\n${finalStream}endstream`);
    const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    pages.push({ pageId, contentId });
  });

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pages.map((page) => `${page.pageId} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

function pdfText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()\\]/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .slice(0, 400);
}

function wrapPdfText(value: string, maxLength: number) {
  const raw = String(value || "Sin datos")
    .replace(/\t/g, "  ")
    .replace(/\r/g, "")
    .split("\n");
  const lines: string[] = [];

  raw.forEach((paragraph) => {
    const normalized = paragraph.trim();
    if (!normalized) {
      lines.push("");
      return;
    }

    let line = "";
    normalized.split(/\s+/).forEach((word) => {
      const chunks = word.length > maxLength
        ? word.match(new RegExp(`.{1,${maxLength}}`, "g")) ?? [word]
        : [word];

      chunks.forEach((chunk) => {
        const next = line ? `${line} ${chunk}` : chunk;
        if (next.length > maxLength && line) {
          lines.push(line);
          line = chunk;
        } else {
          line = next;
        }
      });
    });

    if (line) lines.push(line);
  });

  return lines.length ? lines : ["Sin datos"];
}

function auditValueOrMessage(value: string, emptyMessage: string) {
  const normalized = safeJson(value);
  return normalized === "Sin datos" ? emptyMessage : normalized;
}

function auditSectionsForPdf(item: AuditLogItem) {
  if (item.action === "UPDATE") {
    return [
      {
        title: "Antes del cambio",
        help: "Datos que tenia el registro antes de guardar esta accion.",
        body: auditValueOrMessage(item.old_state_json, "No hay datos previos registrados para este cambio.")
      },
      {
        title: "Despues del cambio",
        help: "Datos que quedaron guardados despues de completar esta accion.",
        body: auditValueOrMessage(item.new_state_json, "No hay datos posteriores registrados para este cambio.")
      }
    ];
  }

  if (item.action === "DELETE") {
    return [
      {
        title: "Datos eliminados",
        help: "Informacion que tenia el registro antes de ser eliminado.",
        body: auditValueOrMessage(item.old_state_json, "No hay datos previos registrados para esta eliminacion.")
      }
    ];
  }

  return [
    {
      title: "Datos creados",
      help: "Informacion guardada al crear el registro.",
      body: auditValueOrMessage(item.new_state_json, "No hay datos registrados para esta creacion.")
    }
  ];
}

function safeJson(value: string) {
  if (!value) return "Sin datos";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function serviceLabel(service: string) {
  const labels: Record<string, string> = {
    all: "Todos",
    catalog: "Catalogo",
    identity: "Usuarios",
    subscription: "Suscripciones",
    engagement: "Actividad"
  };
  return labels[service] ?? service;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    INSERT: "Creacion",
    UPDATE: "Actualizacion",
    DELETE: "Eliminacion"
  };
  return labels[action] ?? (action || "Todas");
}

function formatDate(value: string) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Guatemala"
  }).format(parsed);
}
