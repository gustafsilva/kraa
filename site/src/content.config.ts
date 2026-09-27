import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { ILLUSTRATIONS } from "./lib/site";

const docs = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Ilustração do Kraa exibida ao lado do título (public/brand/<nome>.webp). */
    illustration: z.enum(ILLUSTRATIONS).optional(),
  }),
});

export const collections = { docs };
