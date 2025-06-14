import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [
		tsconfigPaths(),
		tailwindcss(),
		tanstackStart({
			target: "vercel",
		}),
	],
	ssr: {
		noExternal: ["@sharehouse-bills/api"],
	},
	optimizeDeps: {
		include: ["@sharehouse-bills/api"],
	},
});
