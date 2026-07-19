import type { APIRoute } from "astro";
import { authenticateAccessRequest } from "../../../security/access-auth";

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const env = ctx.locals.runtime.env;
  const identity = await authenticateAccessRequest(ctx.request, env);
  return Response.json({
    authenticated: !!identity,
    role: identity?.role ?? null,
    email: identity?.email ?? null,
    hasPublisherEnv: typeof env.TRACE_ADMIN_PUBLISHERS === "string",
    publisherEnvLen: typeof env.TRACE_ADMIN_PUBLISHERS === "string" ? env.TRACE_ADMIN_PUBLISHERS.length : 0,
    hasReaderEnv: typeof env.TRACE_ADMIN_READERS === "string",
    hasAccessTeamDomain: typeof env.CF_ACCESS_TEAM_DOMAIN === "string",
    hasAccessAud: typeof env.CF_ACCESS_AUD === "string",
    hasJwtHeader: ctx.request.headers.has("Cf-Access-Jwt-Assertion"),
  });
};

export const POST = GET;
