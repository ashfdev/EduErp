import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import type { OpenAPIObject } from "openapi3-ts/oas30";
import { registry } from "./registry";
import "./paths"; // side-effect: registers every path above against `registry`

export function generateOpenApiDocument(): OpenAPIObject {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "EduErp API",
      version: "1.0.0",
      description:
        "Core API for the Education ERP. Every response follows the { success, data, meta? } / { success: false, error } envelope described in CLAUDE.md. " +
        "This spec covers a representative core of routes as a working pattern — see src/openapi/paths.ts to extend it to more modules; every registered " +
        "schema is the exact same Zod schema the route already validates against.",
    },
    servers: [{ url: "/", description: "Same origin as this API" }],
  });
} 
