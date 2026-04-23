import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { workflow } from "workflow/vite";

export default defineConfig({
	optimizeDeps: {
		exclude: [
			"pdf-parse",
			"pdf-parse/worker",
			"pdfjs-dist",
			"@napi-rs/canvas",
			"@napi-rs/canvas-darwin-arm64",
		],
	},
	server: {
		allowedHosts: ["local.1f.io", "bills.1f.io"],
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [tailwindcss(), tanstackStart(), nitro(), workflow(), react()],
});
