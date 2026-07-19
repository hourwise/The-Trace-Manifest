import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const op = ctx.locals.operator;
  return Response.json({
    hasOperator: !!op,
    role: op?.role ?? "none",
    email: op?.email ?? "none",
  });
};

export const POST: APIRoute = async (ctx) => {
  const op = ctx.locals.operator;
  return Response.json({
    hasOperator: !!op,
    role: op?.role ?? "none",
    email: op?.email ?? "none",
  });
};
