import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const docs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content" }),
  schema: z.object({
    title: z.string(),
    eyebrow: z.string().optional(),
    description: z.string(),
    section: z.string().optional(),
    sectionLabel: z.string().optional(),
    order: z.number().optional(),
  }),
});

export const collections = { docs };
