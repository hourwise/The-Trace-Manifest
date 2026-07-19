import type { APIRoute } from "astro";

export const prerender = false;

// CANARY DEPLOY — if you see this, the deployment is live
export const GET: APIRoute = async () => {
  return Response.json({ deployed: true, commit: "8ed9f46-canary", time: new Date().toISOString() });
};

export const POST: APIRoute = async () => {
  return Response.json({ deployed: true, commit: "8ed9f46-canary", time: new Date().toISOString() });
};
