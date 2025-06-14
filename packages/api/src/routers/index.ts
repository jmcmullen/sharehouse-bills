import { protectedProcedure, publicProcedure } from "../lib/orpc";
import { billsRouter } from "./bills";
import { debugRouter } from "./debug";
import { housematesRouter } from "./housemates";
import { todoRouter } from "./todo";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	privateData: protectedProcedure.handler(({ context }) => {
		return {
			message: "This is private",
			user: context.session?.user,
		};
	}),
	todo: todoRouter,
	bills: billsRouter,
	housemates: housematesRouter,
	debug: debugRouter,
};
export type AppRouter = typeof appRouter;
