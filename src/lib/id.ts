import { nanoid } from "nanoid";
import { z } from "zod";

export const entityIdSchema = z.string().min(1);

export function generateEntityId() {
	return nanoid(21);
}
