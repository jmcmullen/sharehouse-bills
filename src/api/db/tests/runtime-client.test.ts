import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("../../../../", import.meta.url).pathname;

async function sourceFiles(dir: string): Promise<string[]> {
	const entries = await readdir(join(root, dir), { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory())
				return ["tests", "scripts"].includes(entry.name)
					? []
					: sourceFiles(path);
			return /\.tsx?$/.test(entry.name) ? [path] : [];
		}),
	);
	return nested.flat();
}

// Workflow step functions bundle their own copy of the server code. The
// native libsql entry drags in a platform binary Vercel does not ship, which
// silently broke every WhatsApp workflow from 8 Sep 2026.
test("runtime code only loads the HTTP libsql client", async () => {
	const files = [
		...(await sourceFiles("src")),
		...(await sourceFiles("workflows")),
	];
	const offenders = [];
	for (const file of files) {
		const text = await readFile(join(root, file), "utf8");
		if (
			/import\s+\{[^}]*\}\s+from\s+"(@libsql\/client|drizzle-orm\/libsql)"/.test(
				text.replace(/import\s+type\s+\{[^}]*\}\s+from\s+"[^"]+";?/g, ""),
			)
		)
			offenders.push(file);
	}
	assert.deepEqual(offenders, []);
});
