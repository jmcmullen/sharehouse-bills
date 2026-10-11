import { formatCents } from "../../lib/money";
import { db } from "../db/index.server";
import { bills, debts, housemates } from "../db/schema";
import { createShares, splitAcrossHousemates } from "../services/bills/shares";

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
		totalCents: 34285,
		dueDate: new Date("2024-06-10"),
	},
	{
		billerName: "AGL Gas",
		totalCents: 8945,
		dueDate: new Date("2024-06-08"),
	},
	{
		billerName: "Telstra",
		totalCents: 7999,
		dueDate: new Date("2024-06-05"),
	},
	{
		billerName: "Sydney Water",
		totalCents: 15670,
		dueDate: new Date("2024-05-28"),
	},
	{
		billerName: "Weekly Rent",
		totalCents: 189000,
		dueDate: new Date("2024-06-13"),
	},
	{
		billerName: "Weekly Rent",
		totalCents: 189000,
		dueDate: new Date("2024-06-06"),
	},
	{
		billerName: "Weekly Rent",
		totalCents: 189000,
		dueDate: new Date("2024-05-30"),
	},
	{
		billerName: "Plumber - Blocked Drain",
		totalCents: 18500,
		dueDate: new Date("2024-05-22"),
	},
	{
		billerName: "Optus Mobile",
		totalCents: 6500,
		dueDate: new Date("2024-05-20"),
	},
	{
		billerName: "Netflix",
		totalCents: 1999,
		dueDate: new Date("2024-05-15"),
	},
	{
		billerName: "Spotify Premium Family",
		totalCents: 2399,
		dueDate: new Date("2024-05-12"),
	},
	{
		billerName: "TPG Internet",
		totalCents: 6999,
		dueDate: new Date("2024-05-10"),
	},
	{
		billerName: "Electrician - Outlet Repair",
		totalCents: 14500,
		dueDate: new Date("2024-05-08"),
	},
	{
		billerName: "EnergyAustralia",
		totalCents: 29845,
		dueDate: new Date("2024-05-05"),
	},
	{
		billerName: "Jemena Gas",
		totalCents: 7632,
		dueDate: new Date("2024-05-03"),
	},

	// Current/upcoming bills
	{
		billerName: "Weekly Rent",
		totalCents: 189000,
		dueDate: new Date("2024-06-20"),
	},
	{
		billerName: "NBN Internet",
		totalCents: 8999,
		dueDate: new Date("2024-06-22"),
	},
	{
		billerName: "Origin Energy",
		totalCents: 29865,
		dueDate: new Date("2024-06-25"),
	},
	{
		billerName: "AGL Gas",
		totalCents: 6780,
		dueDate: new Date("2024-06-28"),
	},
	{
		billerName: "Telstra",
		totalCents: 7999,
		dueDate: new Date("2024-07-05"),
	},
	{
		billerName: "Gardening Service",
		totalCents: 12000,
		dueDate: new Date("2024-07-01"),
	},
	{
		billerName: "Cleaning Service",
		totalCents: 8500,
		dueDate: new Date("2024-06-24"),
	},
	{
		billerName: "Vodafone",
		totalCents: 5500,
		dueDate: new Date("2024-06-26"),
	},
	{
		billerName: "YouTube Premium Family",
		totalCents: 2299,
		dueDate: new Date("2024-06-30"),
	},
	{
		billerName: "Disney+ Annual",
		totalCents: 13999,
		dueDate: new Date("2024-07-02"),
	},
	{
		billerName: "HVAC Maintenance",
		totalCents: 19500,
		dueDate: new Date("2024-07-03"),
	},
	{
		billerName: "Pest Control Service",
		totalCents: 16500,
		dueDate: new Date("2024-07-08"),
	},
	{
		billerName: "Optus NBN",
		totalCents: 7900,
		dueDate: new Date("2024-07-10"),
	},
	{
		billerName: "Stan Streaming",
		totalCents: 1600,
		dueDate: new Date("2024-07-12"),
	},

	// Future bills
	{
		billerName: "Weekly Rent",
		totalCents: 189000,
		dueDate: new Date("2024-06-27"),
	},
	{
		billerName: "Weekly Rent",
		totalCents: 189000,
		dueDate: new Date("2024-07-04"),
	},
	{
		billerName: "Weekly Rent",
		totalCents: 189000,
		dueDate: new Date("2024-07-11"),
	},
	{
		billerName: "Home Insurance",
		totalCents: 24550,
		dueDate: new Date("2024-07-15"),
	},
	{
		billerName: "Contents Insurance",
		totalCents: 8900,
		dueDate: new Date("2024-07-18"),
	},
	{
		billerName: "Pool Maintenance",
		totalCents: 12500,
		dueDate: new Date("2024-07-22"),
	},
	{
		billerName: "Window Cleaning",
		totalCents: 9500,
		dueDate: new Date("2024-07-25"),
	},
	{
		billerName: "Amazon Prime",
		totalCents: 999,
		dueDate: new Date("2024-07-28"),
	},
	{
		billerName: "Car Insurance",
		totalCents: 14580,
		dueDate: new Date("2024-08-01"),
	},
	{
		billerName: "Handyman - Door Repair",
		totalCents: 8900,
		dueDate: new Date("2024-08-03"),
	},
];

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
				`💰 Created bill: ${insertedBill.billerName} - ${formatCents(insertedBill.totalCents)}`,
			);

			// Shares split equally like any new bill; paid state comes only from
			// allocations, so seeded shares start unpaid.
			const splits = await splitAcrossHousemates(insertedBill.totalCents);
			await createShares(insertedBill.id, splits);
			console.log(`  💸 Created ${splits.length} debt records`);
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
