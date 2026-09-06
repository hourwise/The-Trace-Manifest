export type AdminSection =
  | "overview"
  | "desk"
  | "review"
  | "social"
  | "knowledge"
  | "extract-claims"
  | "ask"
  | "sources"
  | "jobs"
  | "guides";

export interface AdminNavItem {
  id: AdminSection;
  label: string;
  href: string;
  description: string;
}

export interface AdminNavGroup {
  id: "editorial" | "evidence-knowledge" | "operations";
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_OVERVIEW: AdminNavItem = {
  id: "overview",
  label: "Overview",
  href: "/admin",
  description: "Admin workspace overview",
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "editorial",
    label: "Editorial",
    items: [
      { id: "desk", label: "TRACE Desk", href: "/admin/desk", description: "Governed editorial candidates" },
      { id: "review", label: "Review Queue", href: "/admin/review", description: "Publisher review and publication" },
      { id: "social", label: "Social Signals", href: "/admin/social", description: "Discovery leads for review" },
    ],
  },
  {
    id: "evidence-knowledge",
    label: "Evidence & Knowledge",
    items: [
      { id: "knowledge", label: "Knowledge Builder", href: "/admin/knowledge", description: "Structured TRACE knowledge" },
      { id: "extract-claims", label: "Extract Claims", href: "/admin/extract-claims", description: "Deterministic claim extraction" },
      { id: "ask", label: "Ask TRACE", href: "/admin/ask", description: "Governed evidence research" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { id: "sources", label: "Sources", href: "/admin/sources", description: "Source registry and health" },
      { id: "jobs", label: "Ingestion Jobs", href: "/admin/jobs", description: "Ingestion and schedule outcomes" },
      { id: "guides", label: "Guides Lab", href: "/admin/guides", description: "Verified technical guides" },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  ADMIN_OVERVIEW,
  ...ADMIN_NAV_GROUPS.flatMap((group) => group.items),
];

function normalisePath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  if (path === "/") return path;
  return path.replace(/\/+$/, "");
}

export function resolveAdminSection(pathname: string): AdminSection | null {
  const path = normalisePath(pathname);
  if (path === ADMIN_OVERVIEW.href) return ADMIN_OVERVIEW.id;

  const matchingItems = ADMIN_NAV_ITEMS
    .filter((item) => item.id !== "overview" && (path === item.href || path.startsWith(`${item.href}/`)))
    .sort((left, right) => right.href.length - left.href.length);

  return matchingItems[0]?.id ?? null;
}

export function isAdminPath(pathname: string): boolean {
  return resolveAdminSection(pathname) !== null;
}
