import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { recurringBillAssignments } from "../db/schema/recurring-bill-assignments";
import { recurringBills } from "../db/schema/recurring-bills";

interface RecurringBill {
	id: number;
	templateName: string;
	billerName: string;
	totalAmount: number;
	frequency: string;
	dayOfWeek?: number | null;
	dayOfMonth?: number | null;
	isActive: boolean;
	lastGeneratedDate?: Date | null;
	splitStrategy: string;
}

/**
 * Generate all due recurring bills for the given date
 */
export async function generateDueBills(targetDate: Date = new Date()): Promise<{
	generated: number;
	bills: Array<{ recurringBillId: number; billId: number }>;
}> {
	const activeRecurringBills = await db
		.select()
		.from(recurringBills)
		.where(
			and(
				eq(recurringBills.isActive, true),
				or(
					isNull(recurringBills.endDate),
					// End date is in the future
					// TODO: Add proper date comparison
				),
			),
		);

	const generatedBills = [];
	let totalGenerated = 0;

	for (const recurringBill of activeRecurringBills) {
		const shouldGenerate = shouldGenerateBill(recurringBill, targetDate);

		if (shouldGenerate) {
			const billId = await generateBillFromTemplate(recurringBill, targetDate);
			if (billId) {
				generatedBills.push({ recurringBillId: recurringBill.id, billId });
				totalGenerated++;

				// Update last generated date
				await db
					.update(recurringBills)
					.set({ lastGeneratedDate: targetDate })
					.where(eq(recurringBills.id, recurringBill.id));
			}
		}
	}

	return { generated: totalGenerated, bills: generatedBills };
}

/**
 * Check if a bill should be generated for the given date
 */
function shouldGenerateBill(
	recurringBill: RecurringBill,
	targetDate: Date,
): boolean {
	// Check if we already generated a bill for this period
	if (recurringBill.lastGeneratedDate) {
		const lastGenerated = new Date(recurringBill.lastGeneratedDate);

		if (recurringBill.frequency === "weekly") {
			// Check if we're in the same week
			const weeksDiff = Math.floor(
				(targetDate.getTime() - lastGenerated.getTime()) /
					(7 * 24 * 60 * 60 * 1000),
			);
			if (weeksDiff < 1) return false;
		} else if (recurringBill.frequency === "monthly") {
			// Check if we're in the same month
			if (
				lastGenerated.getFullYear() === targetDate.getFullYear() &&
				lastGenerated.getMonth() === targetDate.getMonth()
			) {
				return false;
			}
		}
	}

	// Check if today matches the recurring pattern
	if (
		recurringBill.frequency === "weekly" &&
		recurringBill.dayOfWeek !== null
	) {
		return targetDate.getDay() === recurringBill.dayOfWeek;
	}
	if (
		recurringBill.frequency === "monthly" &&
		recurringBill.dayOfMonth !== null
	) {
		return targetDate.getDate() === recurringBill.dayOfMonth;
	}

	return false;
}

/**
 * Generate a bill from a recurring bill template
 */
async function generateBillFromTemplate(
	recurringBill: RecurringBill,
	dueDate: Date,
): Promise<number | null> {
	try {
		// Create the bill
		const [newBill] = await db
			.insert(bills)
			.values({
				billerName: recurringBill.billerName,
				totalAmount: recurringBill.totalAmount,
				dueDate,
				recurringBillId: recurringBill.id,
				pdfUrl: null, // Recurring bills don't have PDFs
			})
			.returning({ id: bills.id });

		// Get ALL active assignments for this recurring bill (including owners) to calculate proper split
		const allAssignments = await db
			.select({
				housemateId: recurringBillAssignments.housemateId,
				customAmount: recurringBillAssignments.customAmount,
				isOwner: housemates.isOwner,
			})
			.from(recurringBillAssignments)
			.innerJoin(
				housemates,
				eq(recurringBillAssignments.housemateId, housemates.id),
			)
			.where(
				and(
					eq(recurringBillAssignments.recurringBillId, recurringBill.id),
					eq(recurringBillAssignments.isActive, true),
					eq(housemates.isActive, true),
				),
			);

		// Get only non-owner assignments for debt creation
		const nonOwnerAssignments = allAssignments.filter(
			(assignment) => !assignment.isOwner,
		);

		// Calculate debt amounts
		let debtEntries: Array<{
			billId: number;
			housemateId: number;
			amountOwed: number;
			isPaid: boolean;
		}>;
		if (recurringBill.splitStrategy === "equal") {
			// Divide by ALL active housemates (including owners) but only create debts for non-owners
			const amountPerPerson = recurringBill.totalAmount / allAssignments.length;
			debtEntries = nonOwnerAssignments.map((assignment) => ({
				billId: newBill.id,
				housemateId: assignment.housemateId,
				amountOwed: amountPerPerson,
				isPaid: false,
			}));
		} else {
			// Custom amounts - only for non-owners
			debtEntries = nonOwnerAssignments.map((assignment) => ({
				billId: newBill.id,
				housemateId: assignment.housemateId,
				amountOwed: assignment.customAmount || 0,
				isPaid: false,
			}));
		}

		// Insert debt records
		await db.insert(debts).values(debtEntries);

		return newBill.id;
	} catch (error) {
		console.error("Error generating bill from template:", error);
		return null;
	}
}

/**
 * Get next Thursday for weekly bills
 */
export function getNextThursday(fromDate: Date = new Date()): Date {
	const date = new Date(fromDate);
	const day = date.getDay();
	const daysUntilThursday = (4 - day + 7) % 7;
	date.setDate(
		date.getDate() + (daysUntilThursday === 0 ? 7 : daysUntilThursday),
	);
	return date;
}

/**
 * Manual generation for testing
 */
export async function generateWeeklyRentBill(): Promise<number | null> {
	const rentTemplate = await db
		.select()
		.from(recurringBills)
		.where(
			and(
				eq(recurringBills.templateName, "Weekly Rent"),
				eq(recurringBills.isActive, true),
			),
		)
		.limit(1);

	if (rentTemplate.length === 0) {
		throw new Error("Weekly rent template not found");
	}

	const nextThursday = getNextThursday();
	return generateBillFromTemplate(rentTemplate[0], nextThursday);
}
