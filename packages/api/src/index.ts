import "dotenv/config";

// Export for package usage
export { appRouter as router } from "./routers/index";
export { createContext } from "./lib/context";
export { auth } from "./lib/auth";
export { o, publicProcedure, protectedProcedure } from "./lib/orpc";
export type { Context } from "./lib/context";

// Export services
export { AIParserService } from "./services/ai-parser";
export { BillProcessorService } from "./services/bill-processor";
export { EmailNotifierService } from "./services/email-notifier";
export type { ParsedBill } from "./services/ai-parser";
export type {
	FileAttachment,
	ProcessingResult,
} from "./services/bill-processor";
