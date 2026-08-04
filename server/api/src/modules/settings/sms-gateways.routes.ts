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
import { smsGatewayConfigSchema } from "@education-erp/validators";

export const smsGatewaysRouter = Router();
smsGatewaysRouter.use(authenticate, authorize(SETTINGS_INSTITUTION_ROLES));

const PROVIDERS = ["SSL_WIRELESS", "BULKSMSBD", "OTHER"] as const;

// Never returns the plaintext or ciphertext of api_key/api_secret -- only a
// has-value indicator, same discipline as payment-gateways.routes.ts.
smsGatewaysRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.smsGatewayConfig.findMany({ where: { provider: { in: [...PROVIDERS] } } });
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    const data = PROVIDERS.map((provider) => {
      const row = byProvider.get(provider);
      return {
        provider,
        has_api_key: Boolean(row?.api_key),
        has_api_secret: Boolean(row?.api_secret),
        sender_id: row?.sender_id ?? null,
        api_url: row?.api_url ?? null,
        is_active: row?.is_active ?? false,
        updated_at: row?.updated_at ?? null,
      };
    });
    res.json({ success: true, data });
  }),
);

smsGatewaysRouter.put(
  "/:provider",
  asyncHandler(async (req, res) => {
    const provider = reqParam(req, "provider").toUpperCase();
    if (!(PROVIDERS as readonly string[]).includes(provider)) {
      throw badRequest(`Unknown SMS gateway provider: ${provider}`);
    }
    const body = smsGatewayConfigSchema.parse(req.body);
    const data: Record<string, unknown> = {
      updated_by_id: req.user!.sub,
    };
    // Blank/omitted fields mean "leave unchanged" -- never clear an
    // already-saved credential just because the edit form's field was left
    // empty on this particular save (same convention as payment gateways).
    if (body.api_key) data.api_key = encryptSecret(body.api_key);
    if (body.api_secret) data.api_secret = encryptSecret(body.api_secret);
    if (body.sender_id !== undefined) data.sender_id = body.sender_id;
    if (body.api_url !== undefined) data.api_url = body.api_url;
    if (body.is_active !== undefined) data.is_active = body.is_active;

    const row = await prisma.$transaction(async (tx) => {
      // Only one SMS gateway can be the live outgoing channel at a time --
      // unlike payment gateways, where several can stay active
      // simultaneously since the payer picks one per transaction. Setting
      // is_active here deactivates every other provider first, mirroring
      // the exact "deactivate siblings" pattern already used for document-
      // template activation and authority signatures elsewhere in this
      // codebase.
      if (data.is_active === true) {
        await tx.smsGatewayConfig.updateMany({
          where: { provider: { not: provider as (typeof PROVIDERS)[number] } },
          data: { is_active: false },
        });
      }
      return tx.smsGatewayConfig.upsert({
        where: { provider: provider as (typeof PROVIDERS)[number] },
        create: { provider: provider as (typeof PROVIDERS)[number], is_active: false, ...data },
        update: data,
      });
    });

    await logAudit("SMS_GATEWAY_CONFIG_UPDATE", {
      userId: req.user!.sub,
      targetType: "SmsGatewayConfig",
      targetId: row.id,
      metadata: { provider, updated_fields: Object.keys(data).filter((k) => k !== "updated_by_id") },
      req,
    });

    res.json({
      success: true,
      data: {
        provider: row.provider,
        has_api_key: Boolean(row.api_key),
        has_api_secret: Boolean(row.api_secret),
        sender_id: row.sender_id,
        api_url: row.api_url,
        is_active: row.is_active,
        updated_at: row.updated_at,
      },
    });
  }),
);
