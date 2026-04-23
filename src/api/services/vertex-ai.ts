import { createVertex } from "@ai-sdk/google-vertex";

const vertexConfig: Parameters<typeof createVertex>[0] = {
	project: process.env.GOOGLE_VERTEX_PROJECT,
	location: process.env.GOOGLE_CLOUD_REGION || "us-central1",
};

if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
	vertexConfig.googleAuthOptions = {
		credentials: {
			client_email: process.env.GOOGLE_CLIENT_EMAIL,
			private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
		},
		scopes: ["https://www.googleapis.com/auth/cloud-platform"],
	};
}

const vertex = createVertex(vertexConfig);

export function getVertexModel(modelId: string) {
	return vertex(modelId);
}
