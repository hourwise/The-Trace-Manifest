// The dedicated Astro route wins over the admin catch-all route. Keep this
// thin authenticated proxy so Find Related always uses the Worker handler.
import type { APIRoute } from "astro";
import { handleAdminProxyRequest } from "./[...path]";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  return handleAdminProxyRequest(request, "related-items", locals.runtime.env);
};
