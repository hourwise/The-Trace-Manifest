import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  return Response.json({
    hasJwt: ctx.request.headers.has("Cf-Access-Jwt-Assertion"),
    url: ctx.request.url,
    path: new URL(ctx.request.url).pathname,
  });
};
