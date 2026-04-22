import evlog from "evlog/nitro/v3";
import { defineConfig } from "nitro";

export default defineConfig({
	experimental: {
		asyncContext: true,
	},
	modules: [
		evlog({
			env: {
				service: "sharehouse-bills",
			},
			include: ["/**"],
			exclude: [
				"/_serverFn/**",
				"/src/**",
				"/_build/**",
				"/_server/**",
				"/node_modules/**",
				"/@fs/**",
				"/@id/**",
				"/@react-refresh",
				"/@vite/**",
				"/__vite_ping",
				"/favicon.ico",
				"/robots.txt",
			],
			routes: {
				"/api/up-webhook": {
					service: "sharehouse-bills-banking",
				},
				"/api/email-webhook": {
					service: "sharehouse-bills-ingestion",
				},
				"/api/cron/**": {
					service: "sharehouse-bills-scheduler",
				},
			},
		}),
	],
});
