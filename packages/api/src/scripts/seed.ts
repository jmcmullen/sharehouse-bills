import "dotenv/config";
import { db } from "../db";
import { housemates } from "../db/schema/housemates";

const seedHousemates = [
	{
		name: "Sarah O'Dwyer",
		email: "sarah@example.com",
		bankAlias: "Sarah O'Dwyer",
		isActive: true,
	},
	{
		name: "Jay McMullen",
		email: "jay@example.com",
		bankAlias: "Jay McMullen",
		isActive: true,
		isOwner: true, // Jay is the owner who pays bills
	},
	{
		name: "Matthew Blair",
		email: "matthew@example.com",
		bankAlias: "Matthew Blair",
		isActive: true,
	},
	{
		name: "Erik Villa",
		email: "erik@example.com",
		bankAlias: "Erik Villa",
		isActive: true,
	},
	{
		name: "Oliver",
		email: "oliver@example.com",
		bankAlias: "Oliver",
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
