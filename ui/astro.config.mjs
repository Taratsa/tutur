import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import svelte from "@astrojs/svelte";

function siteUrl() {
  const value = process.env.SITE_URL?.trim() || "http://localhost:4321";
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("SITE_URL must use http or https");
  return value.replace(/\/+$/u, "");
}

function basePath() {
  const value = process.env.BASE_PATH?.trim() || "/";
  if (!value.startsWith("/") || value.includes("?") || value.includes("#")) {
    throw new Error("BASE_PATH must be a path such as /dictionary/ or /");
  }
  const clean = value.replace(/\/+$/u, "");
  return clean ? `${clean}/` : "/";
}

export default defineConfig({
  site: siteUrl(),
  base: basePath(),
  output: "server",
  trailingSlash: "always",
  session: false,
  adapter: node({ mode: "standalone" }),
  integrations: [svelte()],
});
