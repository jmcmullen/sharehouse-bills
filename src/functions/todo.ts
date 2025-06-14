import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../api/db";
import { todo } from "../api/db/schema/todo";

// Get all todos
export const getAllTodos = createServerFn({ method: "GET" }).handler(
	async () => {
		return await db.select().from(todo);
	},
);

// Create a new todo
export const createTodo = createServerFn({ method: "POST" })
	.validator(z.object({ text: z.string().min(1) }))
	.handler(async ({ data }) => {
		const result = await db
			.insert(todo)
			.values({
				text: data.text,
				completed: false,
			})
			.returning();
		return result[0];
	});

// Toggle todo completion
export const toggleTodo = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.number(), completed: z.boolean() }))
	.handler(async ({ data }) => {
		await db
			.update(todo)
			.set({ completed: data.completed })
			.where(eq(todo.id, data.id));
		return { success: true };
	});

// Delete a todo
export const deleteTodo = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.number() }))
	.handler(async ({ data }) => {
		await db.delete(todo).where(eq(todo.id, data.id));
		return { success: true };
	});
