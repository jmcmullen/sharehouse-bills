import {
	ImageResponse,
	type ImageResponseOptions,
} from "@takumi-rs/image-response";
import type { ReactNode } from "react";
import type { OgFont } from "./og-fonts.server";

type OgRouteContext = {
	params?: Record<string, string | string[] | undefined>;
	request: Request;
};

type OgRenderContext = {
	aspectRatio: string;
	height: number;
	layout: {
		content: {
			height: number;
			width: number;
			x: number;
			y: number;
		};
	};
	platform: string;
	safeArea: {
		bottom: number;
		left: number;
		right: number;
		top: number;
	};
	width: number;
};

type OgComponent = ReactNode | ((context: OgRenderContext) => ReactNode);

type CreateOgRouteHandlerOptions = Omit<
	ImageResponseOptions,
	"fonts" | "format" | "height" | "loadDefaultFonts" | "renderer" | "width"
> & {
	baseFonts?: OgFont[];
	cacheControl?: string;
	component: OgComponent;
	format?: "png" | "webp";
	height?: number;
	loadDefaultFonts?: boolean;
	width?: number;
};

function createOgContext(width: number, height: number): OgRenderContext {
	return {
		aspectRatio: "1.91:1",
		height,
		layout: {
			content: {
				height,
				width,
				x: 0,
				y: 0,
			},
		},
		platform: "generic",
		safeArea: {
			bottom: 0,
			left: 0,
			right: 0,
			top: 0,
		},
		width,
	};
}

function applyCacheControl(response: Response, cacheControl: string) {
	const headers = new Headers(response.headers);
	headers.set("Cache-Control", cacheControl);

	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
}

export function createOgRouteHandler({
	baseFonts,
	cacheControl = "public, max-age=300",
	component,
	format = "png",
	height = 630,
	loadDefaultFonts = true,
	width = 1200,
	...imageResponseOptions
}: CreateOgRouteHandlerOptions) {
	return async (_context: OgRouteContext) => {
		const ogContext = createOgContext(width, height);
		const element =
			typeof component === "function" ? component(ogContext) : component;

		const response = new ImageResponse(element, {
			...imageResponseOptions,
			fonts: baseFonts,
			format,
			height,
			loadDefaultFonts,
			width,
		});

		return applyCacheControl(response, cacheControl);
	};
}
