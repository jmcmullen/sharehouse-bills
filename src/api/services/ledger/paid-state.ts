import type { Client } from "@libsql/client";
import { generateEntityId } from "../../../lib/id";
import { toCents } from "./model";

type Executor = Pick<Client, "execute">;

// Writes the ledger's view of "paid" back to the legacy debts/bills columns and
// records the WhatsApp paid notifications that a transition earns.
export async function syncPaidState(
	tx: Executor,
	debtIds: string[],
): Promise<void> {
	const ids = [...new Set(debtIds)];
	if (!ids.length) return;
	const now = Math.floor(Date.now() / 1000);
	const debts = (
		await tx.execute({
			sql: `SELECT d.id,d.bill_id,d.amount_owed,d.is_paid,coalesce((SELECT sum(amount_cents) FROM ledger_bill_allocations WHERE debt_id=d.id),0) AS allocated FROM debts d WHERE d.id IN (${ids.map(() => "?").join(",")})`,
			args: ids,
		})
	).rows;
	for (const debt of debts) {
		const paidCents = Math.max(0, Number(debt.allocated));
		const paid = paidCents >= toCents(Number(debt.amount_owed));
		await tx.execute({
			sql: "UPDATE debts SET amount_paid=?,is_paid=?,paid_at=CASE WHEN ? THEN coalesce(paid_at,?) ELSE NULL END,updated_at=? WHERE id=?",
			args: [paidCents / 100, paid ? 1 : 0, paid ? 1 : 0, now, now, debt.id],
		});
		if (paid && !Number(debt.is_paid))
			await recordNotification(tx, "debt_paid", String(debt.id), now);
	}
	const billIds = [...new Set(debts.map((debt) => String(debt.bill_id)))];
	for (const billId of billIds) await syncBillStatus(tx, billId, now);
}

async function syncBillStatus(
	tx: Executor,
	billId: string,
	now: number,
): Promise<void> {
	const bill = (
		await tx.execute({
			sql: "SELECT b.status,(SELECT count(*) FROM debts WHERE bill_id=b.id AND is_paid=0) AS open,(SELECT count(*) FROM debts WHERE bill_id=b.id AND amount_paid>0.009) AS started FROM bills b WHERE b.id=?",
			args: [billId],
		})
	).rows[0];
	if (!bill) return;
	const status =
		Number(bill.open) === 0
			? "paid"
			: Number(bill.started) > 0
				? "partially_paid"
				: "pending";
	if (status === bill.status) return;
	await tx.execute({
		sql: "UPDATE bills SET status=?,updated_at=? WHERE id=?",
		args: [status, now, billId],
	});
	if (status === "paid") await recordNotification(tx, "bill_paid", billId, now);
}

async function recordNotification(
	tx: Executor,
	type: "bill_paid" | "debt_paid",
	id: string,
	now: number,
): Promise<void> {
	const bill = type === "bill_paid";
	await tx.execute({
		sql: "INSERT INTO whatsapp_notifications(id,event_key,event_type,status,bill_id,debt_id,payload,created_at,updated_at) VALUES (?,?,?,'pending',?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING",
		args: [
			generateEntityId(),
			`${bill ? "bill-paid" : "debt-paid"}:${id}`,
			type,
			bill ? id : null,
			bill ? null : id,
			JSON.stringify({ source: "ledger" }),
			now,
			now,
		],
	});
}
