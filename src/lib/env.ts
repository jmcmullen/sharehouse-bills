export function requireEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (value) {
		return value;
	}

	const error = new Error(`${name} environment variable is required`);
	console.error(error.message, {
		env: name,
	});
	throw error;
}
