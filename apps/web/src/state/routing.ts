export type ViewName = "office" | "workspace";
export type RouteResolution = { view: ViewName; redirectTo: string | null };

/** Resolves the view for a location. Anything but `/office` lands on `/workspace`, keeping the query string. */
export function resolveRoute(pathname: string, search: string): RouteResolution {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (normalized === "/office") return { view: "office", redirectTo: null };
  if (normalized === "/workspace") return { view: "workspace", redirectTo: null };
  return { view: "workspace", redirectTo: `/workspace${search}` };
}

/** Builds the URL used to open a view in a new window; the token travels in the query string. */
export function buildViewUrl(
  path: "/office" | "/workspace",
  token: string | null,
  params: Record<string, string> = {},
): string {
  const query = new URLSearchParams(params);
  if (token) query.set("token", token);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
