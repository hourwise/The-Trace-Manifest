import type { APIRoute } from "astro";
import { handleAdminProxyRequest } from "./[...path]";

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  return handleAdminProxyRequest(ctx.request, "social-signals", ctx.locals.runtime.env, ctx.locals.operator);
};

export const POST: APIRoute = async (ctx) => {
  return handleAdminProxyRequest(ctx.request, "social-signals", ctx.locals.runtime.env, ctx.locals.operator);
};
