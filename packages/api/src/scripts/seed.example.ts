import "dotenv/config";
import { db } from "../db";
import { housemates } from "../db/schema/housemates";

const seedHousemates = [
	{
		name: "John Doe",
		email: "john@example.com",
		bankAlias: "John",
		isActive: true,
	},
	{
		name: "Jane Smith",
		email: "jane@example.com",
		bankAlias: "Jane",
		isActive: true,
		isOwner: true, // Set this for the person who pays bills
	},
	{
		name: "Mike Johnson",
		email: "mike@example.com",
		bankAlias: "Mike",
		isActive: true,
	},
	// Add your actual housemates here
	// {
	//   name: "Your Name",
	//   email: "your.email@example.com",
	//   bankAlias: "YourBankName", // How your name appears in bank transactions
	//   isActive: true,
	// },
];

async function seed() {
	try {
		console.log("🌱 Starting database seed...");

		// Clear existing housemates (optional - remove this if you want to keep existing data)
		console.log("🧹 Clearing existing housemates...");
		await db.delete(housemates);

		// Insert seed data
		console.log("👥 Inserting housemates...");
		const result = await db.insert(housemates).values(seedHousemates);

		console.log(`✅ Successfully added ${seedHousemates.length} housemates!`);

		// Display the created housemates
		const allHousemates = await db.select().from(housemates);
		console.log("\n📋 Current housemates:");
		allHousemates.forEach((housemate, index) => {
			console.log(
				`${index + 1}. ${housemate.name} (${housemate.email}) - Bank: ${housemate.bankAlias} - Active: ${housemate.isActive}`,
			);
		});

		console.log("\n🎉 Database seeding completed!");
	} catch (error) {
		console.error("❌ Error seeding database:", error);
		process.exit(1);
	} finally {
		process.exit(0);
	}
}

// Run the seed function
seed();
