import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_INSTITUTION_ROLES } from "../../lib/roles";
import { reqParam } from "../../lib/req-param";
import { badRequest } from "../../lib/errors";
import { encryptSecret } from "../../lib/crypto";
import { logAudit } from "../../lib/audit-log";
import { paymentGatewayConfigSchema } from "@education-erp/validators";

export const paymentGatewaysRouter = Router();
paymentGatewaysRouter.use(authenticate, authorize(SETTINGS_INSTITUTION_ROLES));

const PROVIDERS = ["BKASH", "NAGAD", "SSLCOMMERZ", "ROCKET"] as const;

// Never returns the plaintext or ciphertext of any credential field -- only
// a has-value indicator and the non-sensitive toggles, so this response is
// always safe to send to the browser (Plan Fourteen, Phase D2).
paymentGatewaysRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.paymentGatewayConfig.findMany({ where: { provider: { in: [...PROVIDERS] } } });
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    const data = PROVIDERS.map((provider) => {
      const row = byProvider.get(provider);
      return {
        provider,
        has_app_key: Boolean(row?.app_key),
        has_app_secret: Boolean(row?.app_secret),
        has_username: Boolean(row?.username),
        has_password: Boolean(row?.password),
        sandbox_mode: row?.sandbox_mode ?? true,
        is_active: row?.is_active ?? false,
        updated_at: row?.updated_at ?? null,
      };
    });
    res.json({ success: true, data });
  }),
);

paymentGatewaysRouter.put(
  "/:provider",
  asyncHandler(async (req, res) => {
    const provider = reqParam(req, "provider").toUpperCase();
    if (!(PROVIDERS as readonly string[]).includes(provider)) {
      throw badRequest(`Unknown payment gateway provider: ${provider}`);
    }
    const body = paymentGatewayConfigSchema.parse(req.body);
    const data: Record<string, unknown> = {
      updated_by_id: req.user!.sub,
    };
    // Blank/omitted credential fields mean "leave unchanged" -- never clear
    // an already-saved secret just because the edit form's field was left
    // empty on this particular save.
    if (body.app_key) data.app_key = body.app_key;
    if (body.app_secret) data.app_secret = encryptSecret(body.app_secret);
    if (body.username) data.username = body.username;
    if (body.password) data.password = encryptSecret(body.password);
    if (body.sandbox_mode !== undefined) data.sandbox_mode = body.sandbox_mode;
    if (body.is_active !== undefined) data.is_active = body.is_active;

    const row = await prisma.paymentGatewayConfig.upsert({
      where: { provider: provider as (typeof PROVIDERS)[number] },
      create: { provider: provider as (typeof PROVIDERS)[number], sandbox_mode: true, is_active: false, ...data },
      update: data,
    });

    await logAudit("PAYMENT_GATEWAY_CONFIG_UPDATE", {
      userId: req.user!.sub,
      targetType: "PaymentGatewayConfig",
      targetId: row.id,
      metadata: { provider, updated_fields: Object.keys(data).filter((k) => k !== "updated_by_id") },
      req,
    });

    res.json({
      success: true,
      data: {
        provider: row.provider,
        has_app_key: Boolean(row.app_key),
        has_app_secret: Boolean(row.app_secret),
        has_username: Boolean(row.username),
        has_password: Boolean(row.password),
        sandbox_mode: row.sandbox_mode,
        is_active: row.is_active,
        updated_at: row.updated_at,
      },
    });
  }),
);
