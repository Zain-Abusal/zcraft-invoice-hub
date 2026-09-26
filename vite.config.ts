// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import type { PluginOption } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const lovableConfig = defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

// The Lovable preset still injects the legacy plugin. Vite 8 resolves paths natively.
export default async function config(env: Parameters<typeof lovableConfig>[0]) {
  const resolved = await lovableConfig(env);
  async function withoutLegacyPaths(option: PluginOption): Promise<PluginOption> {
    const plugin = await option;
    if (Array.isArray(plugin)) return Promise.all(plugin.map(withoutLegacyPaths));
    return plugin && plugin.name === "vite-tsconfig-paths" ? false : plugin;
  }
  return {
    ...resolved,
    plugins: await Promise.all((resolved.plugins ?? []).map(withoutLegacyPaths)),
    resolve: { ...resolved.resolve, tsconfigPaths: true },
  };
}
