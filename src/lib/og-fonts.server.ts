type OgFont = {
	data: ArrayBuffer | Uint8Array;
	name?: string;
	style?: string;
	weight?: number;
};

type LoadGoogleFontsOptions = {
	family: string;
	style?: string;
	weights?: number[];
};

type ResolveFontSetupOptions = {
	baseFonts: OgFont[] | Promise<OgFont[]>;
};

const GOOGLE_FONTS_USER_AGENT =
	"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const googleFontCache = new Map<string, Promise<OgFont[]>>();

function normalizeRequestedFontWeights(weights: number[] | undefined) {
	if (!weights || weights.length === 0) {
		return [400];
	}

	return [...new Set(weights)];
}

function buildGoogleFontsCssUrl(family: string, weight: number) {
	const normalizedFamily = family.trim().split(/\s+/).join("+");
	return `https://fonts.googleapis.com/css2?family=${normalizedFamily}:wght@${weight}&display=swap`;
}

function parseFontUrlsFromCss(css: string) {
	const ttfMatches = [
		...css.matchAll(/url\(([^)]+)\)\s*format\((['"])(truetype|opentype)\2\)/gi),
	];
	const preferredUrls = ttfMatches
		.map((match) => match[1]?.trim().replaceAll(/^['"]|['"]$/g, ""))
		.filter((value): value is string => Boolean(value));

	if (preferredUrls.length > 0) {
		return [...new Set(preferredUrls)];
	}

	const fallbackMatches = [...css.matchAll(/url\(([^)]+)\)/g)];
	return [
		...new Set(
			fallbackMatches
				.map((match) => match[1]?.trim().replaceAll(/^['"]|['"]$/g, ""))
				.filter((value): value is string => Boolean(value)),
		),
	];
}

async function createGoogleFontPromise(config: {
	family: string;
	style: string;
	weight: number;
}): Promise<OgFont[]> {
	try {
		const cssResponse = await fetch(
			buildGoogleFontsCssUrl(config.family, config.weight),
			{
				headers: {
					"User-Agent": GOOGLE_FONTS_USER_AGENT,
				},
			},
		);

		if (!cssResponse.ok) {
			return [];
		}

		const css = await cssResponse.text();
		const fontUrls = parseFontUrlsFromCss(css);
		if (fontUrls.length === 0) {
			return [];
		}

		const fonts: Array<OgFont | null> = await Promise.all(
			fontUrls.map(async (url) => {
				try {
					const response = await fetch(url, {
						headers: {
							"User-Agent": GOOGLE_FONTS_USER_AGENT,
						},
					});

					if (!response.ok) {
						return null;
					}

					return {
						data: await response.arrayBuffer(),
						name: config.family,
						style: config.style,
						weight: config.weight,
					} satisfies OgFont;
				} catch {
					return null;
				}
			}),
		);

		return fonts.filter((font): font is OgFont => font !== null);
	} catch {
		return [];
	}
}

export async function loadGoogleFonts({
	family,
	style = "normal",
	weights,
}: LoadGoogleFontsOptions): Promise<OgFont[]> {
	const loadedFonts = await Promise.all(
		normalizeRequestedFontWeights(weights).map(async (weight) => {
			const cacheKey = `${family}:${weight}:${style}`;
			const cachedFonts = googleFontCache.get(cacheKey);
			if (cachedFonts) {
				return cachedFonts;
			}

			const pendingFonts = createGoogleFontPromise({
				family,
				style,
				weight,
			});
			googleFontCache.set(cacheKey, pendingFonts);

			const fonts = await pendingFonts;
			if (fonts.length === 0) {
				googleFontCache.delete(cacheKey);
			}

			return fonts;
		}),
	);

	return loadedFonts.flat();
}

function resolveFirstNamedFontFamily(fonts: OgFont[]) {
	for (const font of fonts) {
		const fontFamily = font.name?.trim();
		if (fontFamily) {
			return fontFamily;
		}
	}

	return undefined;
}

export async function resolveFontSetup({
	baseFonts,
}: ResolveFontSetupOptions): Promise<{
	families: {
		base?: string;
		locales: Record<string, string>;
	};
	fonts: OgFont[];
}> {
	const fonts = await baseFonts;

	return {
		families: {
			base: resolveFirstNamedFontFamily(fonts),
			locales: {},
		},
		fonts,
	};
}

export type { OgFont };
