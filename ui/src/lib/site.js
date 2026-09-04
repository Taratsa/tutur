const configuredSiteUrl = String(
  import.meta.env.SITE || import.meta.env.PUBLIC_SITE_URL || "http://localhost:4321",
).replace(/\/+$/u, "");
const configuredBasePath = String(import.meta.env.BASE_URL || "/").replace(/\/+$/u, "");

export const SITE_URL = configuredSiteUrl;
export const BASE_PATH = configuredBasePath;
export const repositoryUrl =
  import.meta.env.PUBLIC_REPOSITORY_URL || "https://github.com/Taratsa/tutur";

export function sitePath(path = "/") {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (!BASE_PATH) return cleanPath;
  return cleanPath === "/" ? `${BASE_PATH}/` : `${BASE_PATH}${cleanPath}`;
}

export function absoluteRoute(path = "/") {
  const parsed = new URL(SITE_URL);
  return new URL(sitePath(path), `${parsed.protocol}//${parsed.host}/`).toString();
}
