import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel";

export default defineConfig({
  adapter: vercel(),
  integrations: [react(), tailwind({ applyBaseStyles: false })],
  i18n: {
    defaultLocale: "de",
    locales: ["de"],
  },
});
