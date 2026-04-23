import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { generateEntityId } from "../../../lib/id";
import { bills } from "./bills";
import { debts } from "./debts";
import { housemates } from "./housemates";

export const whatsappNotifications = sqliteTable(
	"whatsapp_notifications",
	{
		id: text("id").primaryKey().$defaultFn(generateEntityId),
		eventKey: text("event_key").notNull(),
		eventType: text("event_type", {
			enum: [
				"bill_created",
				"bill_paid",
				"debt_paid",
				"bill_reminder",
				"due_command",
				"assistant_message",
			],
		}).notNull(),
		status: text("status", {
			enum: ["pending", "completed", "failed", "ignored"],
		})
			.notNull()
			.default("pending"),
		billId: text("bill_id").references(() => bills.id, {
			onDelete: "set null",
		}),
		debtId: text("debt_id").references(() => debts.id, {
			onDelete: "set null",
		}),
		housemateId: text("housemate_id").references(() => housemates.id, {
			onDelete: "set null",
		}),
		inboundMessageId: text("inbound_message_id"),
		inboundChatId: text("inbound_chat_id"),
		inboundSenderChatId: text("inbound_sender_chat_id"),
		errorMessage: text("error_message"),
		payload: text("payload", { mode: "json" }).$type<Record<
			string,
			unknown
		> | null>(),
		completedAt: integer("completed_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => ({
		eventKeyIdx: uniqueIndex("whatsapp_notifications_event_key_idx").on(
			table.eventKey,
		),
		eventTypeIdx: index("whatsapp_notifications_event_type_idx").on(
			table.eventType,
		),
		statusIdx: index("whatsapp_notifications_status_idx").on(table.status),
	}),
);
