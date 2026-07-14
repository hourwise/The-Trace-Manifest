import { defineMiddleware } from "astro:middleware";
import { authenticateAccessRequest } from "./security/access-auth";

export const onRequest = defineMiddleware(async (context, next) => {
  if (!context.url.pathname.startsWith("/admin")) return next();

  const env = context.locals.runtime?.env;
  const identity = env ? await authenticateAccessRequest(context.request, env) : null;
  if (!identity) {
    return Response.json(
      { error: "Administrator authentication is required." },
      { status: env ? 401 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  context.locals.operator = identity;
  const response = await next();
  response.headers.set("Cache-Control", "no-store");
  return response;
});
