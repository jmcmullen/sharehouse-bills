import { db } from "../db";
import { bills, debts, housemates } from "../db/schema";

// Test data for realistic sharehouse scenario
const testHousemates = [
	{
		name: "Alex Chen",
		email: "alex.chen@example.com",
		bankAlias: "Alex Chen",
		isActive: true,
		isOwner: true, // Bill payer
	},
	{
		name: "Sarah Wilson",
		email: "sarah.wilson@example.com",
		bankAlias: "S Wilson",
		isActive: true,
		isOwner: false,
	},
	{
		name: "Marcus Thompson",
		email: "marcus.thompson@example.com",
		bankAlias: "Marcus T",
		isActive: true,
		isOwner: false,
	},
	{
		name: "Emma Rodriguez",
		email: "emma.rodriguez@example.com",
		bankAlias: "Emma R",
		isActive: true,
		isOwner: false,
	},
	{
		name: "James Park",
		email: "james.park@example.com",
		bankAlias: "J Park",
		isActive: false, // Moved out recently
		isOwner: false,
	},
];

// Realistic bills for a sharehouse
const testBills = [
	// Recent bills (last 2 months)
	{
		billerName: "Origin Energy",
		totalAmount: 342.85,
		dueDate: new Date("2024-06-10"),
		status: "paid" as const,
	},
	{
		billerName: "AGL Gas",
		totalAmount: 89.45,
		dueDate: new Date("2024-06-08"),
		status: "paid" as const,
	},
	{
		billerName: "Telstra",
		totalAmount: 79.99,
		dueDate: new Date("2024-06-05"),
		status: "partially_paid" as const,
	},
	{
		billerName: "Sydney Water",
		totalAmount: 156.7,
		dueDate: new Date("2024-05-28"),
		status: "paid" as const,
	},
	{
		billerName: "Weekly Rent",
		totalAmount: 1890.0,
		dueDate: new Date("2024-06-13"),
		status: "paid" as const,
	},
	{
		billerName: "Weekly Rent",
		totalAmount: 1890.0,
		dueDate: new Date("2024-06-06"),
		status: "paid" as const,
	},
	{
		billerName: "Weekly Rent",
		totalAmount: 1890.0,
		dueDate: new Date("2024-05-30"),
		status: "paid" as const,
	},
	{
		billerName: "Plumber - Blocked Drain",
		totalAmount: 185.0,
		dueDate: new Date("2024-05-22"),
		status: "paid" as const,
	},
	{
		billerName: "Optus Mobile",
		totalAmount: 65.0,
		dueDate: new Date("2024-05-20"),
		status: "paid" as const,
	},
	{
		billerName: "Netflix",
		totalAmount: 19.99,
		dueDate: new Date("2024-05-15"),
		status: "paid" as const,
	},
	{
		billerName: "Spotify Premium Family",
		totalAmount: 23.99,
		dueDate: new Date("2024-05-12"),
		status: "paid" as const,
	},
	{
		billerName: "TPG Internet",
		totalAmount: 69.99,
		dueDate: new Date("2024-05-10"),
		status: "paid" as const,
	},
	{
		billerName: "Electrician - Outlet Repair",
		totalAmount: 145.0,
		dueDate: new Date("2024-05-08"),
		status: "paid" as const,
	},
	{
		billerName: "EnergyAustralia",
		totalAmount: 298.45,
		dueDate: new Date("2024-05-05"),
		status: "paid" as const,
	},
	{
		billerName: "Jemena Gas",
		totalAmount: 76.32,
		dueDate: new Date("2024-05-03"),
		status: "paid" as const,
	},

	// Current/upcoming bills
	{
		billerName: "Weekly Rent",
		totalAmount: 1890.0,
		dueDate: new Date("2024-06-20"),
		status: "pending" as const,
	},
	{
		billerName: "NBN Internet",
		totalAmount: 89.99,
		dueDate: new Date("2024-06-22"),
		status: "pending" as const,
	},
	{
		billerName: "Origin Energy",
		totalAmount: 298.65,
		dueDate: new Date("2024-06-25"),
		status: "pending" as const,
	},
	{
		billerName: "AGL Gas",
		totalAmount: 67.8,
		dueDate: new Date("2024-06-28"),
		status: "pending" as const,
	},
	{
		billerName: "Telstra",
		totalAmount: 79.99,
		dueDate: new Date("2024-07-05"),
		status: "pending" as const,
	},
	{
		billerName: "Gardening Service",
		totalAmount: 120.0,
		dueDate: new Date("2024-07-01"),
		status: "partially_paid" as const,
	},
	{
		billerName: "Cleaning Service",
		totalAmount: 85.0,
		dueDate: new Date("2024-06-24"),
		status: "pending" as const,
	},
	{
		billerName: "Vodafone",
		totalAmount: 55.0,
		dueDate: new Date("2024-06-26"),
		status: "pending" as const,
	},
	{
		billerName: "YouTube Premium Family",
		totalAmount: 22.99,
		dueDate: new Date("2024-06-30"),
		status: "partially_paid" as const,
	},
	{
		billerName: "Disney+ Annual",
		totalAmount: 139.99,
		dueDate: new Date("2024-07-02"),
		status: "pending" as const,
	},
	{
		billerName: "HVAC Maintenance",
		totalAmount: 195.0,
		dueDate: new Date("2024-07-03"),
		status: "pending" as const,
	},
	{
		billerName: "Pest Control Service",
		totalAmount: 165.0,
		dueDate: new Date("2024-07-08"),
		status: "pending" as const,
	},
	{
		billerName: "Optus NBN",
		totalAmount: 79.0,
		dueDate: new Date("2024-07-10"),
		status: "pending" as const,
	},
	{
		billerName: "Stan Streaming",
		totalAmount: 16.0,
		dueDate: new Date("2024-07-12"),
		status: "pending" as const,
	},

	// Future bills
	{
		billerName: "Weekly Rent",
		totalAmount: 1890.0,
		dueDate: new Date("2024-06-27"),
		status: "pending" as const,
	},
	{
		billerName: "Weekly Rent",
		totalAmount: 1890.0,
		dueDate: new Date("2024-07-04"),
		status: "pending" as const,
	},
	{
		billerName: "Weekly Rent",
		totalAmount: 1890.0,
		dueDate: new Date("2024-07-11"),
		status: "pending" as const,
	},
	{
		billerName: "Home Insurance",
		totalAmount: 245.5,
		dueDate: new Date("2024-07-15"),
		status: "pending" as const,
	},
	{
		billerName: "Contents Insurance",
		totalAmount: 89.0,
		dueDate: new Date("2024-07-18"),
		status: "pending" as const,
	},
	{
		billerName: "Pool Maintenance",
		totalAmount: 125.0,
		dueDate: new Date("2024-07-22"),
		status: "pending" as const,
	},
	{
		billerName: "Window Cleaning",
		totalAmount: 95.0,
		dueDate: new Date("2024-07-25"),
		status: "pending" as const,
	},
	{
		billerName: "Amazon Prime",
		totalAmount: 9.99,
		dueDate: new Date("2024-07-28"),
		status: "pending" as const,
	},
	{
		billerName: "Car Insurance",
		totalAmount: 145.8,
		dueDate: new Date("2024-08-01"),
		status: "pending" as const,
	},
	{
		billerName: "Handyman - Door Repair",
		totalAmount: 89.0,
		dueDate: new Date("2024-08-03"),
		status: "pending" as const,
	},
];

function calculateDebtSplit(
	totalAmount: number,
	billStatus: string,
	activateHousematesCount: number,
	housemateIndex: number,
) {
	const amountPerPerson = totalAmount / activateHousematesCount;

	if (billStatus === "paid") {
		return { amountOwed: amountPerPerson, isPaid: true };
	}
	if (billStatus === "partially_paid") {
		// Make it more realistic - first housemate more likely to have paid
		const paymentChance =
			housemateIndex === 0 ? 0.8 : housemateIndex === 1 ? 0.6 : 0.3;
		return Math.random() < paymentChance
			? { amountOwed: amountPerPerson, isPaid: true }
			: { amountOwed: amountPerPerson, isPaid: false };
	}
	return { amountOwed: amountPerPerson, isPaid: false };
}

export async function populateTestData() {
	console.log("🏠 Starting to populate test data...");

	try {
		// Clear existing data (in reverse order due to foreign keys)
		console.log("🧹 Clearing existing data...");
		await db.delete(debts);
		await db.delete(bills);
		await db.delete(housemates);

		// Insert housemates
		console.log("👥 Inserting housemates...");
		const insertedHousemates = await db
			.insert(housemates)
			.values(testHousemates)
			.returning();
		console.log(`✅ Inserted ${insertedHousemates.length} housemates`);

		// Get active housemates (for debt calculations) - exclude owner who pays bills
		const activeHousemates = insertedHousemates.filter(
			(h) => h.isActive && !h.isOwner,
		);
		console.log(
			`🏃 ${activeHousemates.length} active housemates for debt splitting (excluding owner)`,
		);

		// Insert bills and create corresponding debts
		console.log("📄 Inserting bills and creating debts...");

		for (const billData of testBills) {
			// Insert bill
			const [insertedBill] = await db
				.insert(bills)
				.values(billData)
				.returning();
			console.log(
				`💰 Created bill: ${insertedBill.billerName} - $${insertedBill.totalAmount}`,
			);

			// Create debts for each active housemate
			const debtsToInsert = activeHousemates.map((housemate, index) => {
				const { amountOwed, isPaid } = calculateDebtSplit(
					insertedBill.totalAmount,
					insertedBill.status,
					activeHousemates.length,
					index,
				);

				return {
					billId: insertedBill.id,
					housemateId: housemate.id,
					amountOwed,
					isPaid,
					paidAt: isPaid ? new Date() : null,
				};
			});

			await db.insert(debts).values(debtsToInsert);
			console.log(`  💸 Created ${debtsToInsert.length} debt records`);
		}

		console.log("🎉 Test data population completed successfully!");
		console.log("\n📊 Summary:");
		console.log(
			`   👥 Housemates: ${insertedHousemates.length} (${activeHousemates.length} active)`,
		);
		console.log(`   📄 Bills: ${testBills.length}`);
		console.log(
			`   💸 Total debt records: ${testBills.length * activeHousemates.length}`,
		);

		// Print some stats
		const paidBills = testBills.filter((b) => b.status === "paid").length;
		const partialBills = testBills.filter(
			(b) => b.status === "partially_paid",
		).length;
		const pendingBills = testBills.filter((b) => b.status === "pending").length;

		console.log(`   ✅ Paid bills: ${paidBills}`);
		console.log(`   ⏳ Partially paid bills: ${partialBills}`);
		console.log(`   📋 Pending bills: ${pendingBills}`);
	} catch (error) {
		console.error("❌ Error populating test data:", error);
		throw error;
	}
}

populateTestData()
	.then(() => {
		console.log(
			"✨ Done! Your bills page should now have realistic test data.",
		);
		process.exit(0);
	})
	.catch((error) => {
		console.error("💥 Failed to populate test data:", error);
		process.exit(1);
	});
