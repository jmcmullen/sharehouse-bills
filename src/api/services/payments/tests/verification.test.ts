import assert from "node:assert/strict";
import { test } from "node:test";
import { approveBill, loadBillVerification } from "../verification";
import {
	addBill,
	addShares,
	confirm,
	count,
	fixture,
	ingest,
	receipt,
	recordCash,
	time,
} from "./fixture";

test("pivots housemate payments into bills with shares, receipts, status and summary", async () =>
	fixture(async (client) => {
		await client.execute("DELETE FROM bills");
		await addBill(client, {
			id: "gas",
			name: "AGL Gas",
			dueAt: time - 10,
			billType: "gas",
		});
		await addBill(client, {
			id: "clean",
			name: "Cleaners",
			dueAt: time + 100,
			stackGroup: "cleaning",
		});
		await addShares(client, [
			["gas-o", "oliver", "gas", 10000],
			["gas-s", "sarah", "gas", 5000],
			["clean-o", "oliver", "clean", 3000],
		]);
		await ingest(client, receipt("bank-1", 10000));
		await confirm(client, "bank-1", "oliver", [
			{ debtId: "gas-o", amountCents: 10000 },
		]);
		await recordCash(client, {
			housemateId: "sarah",
			amountCents: 2000,
			receivedAt: time - 5,
			note: "From Sarah",
			allocations: [{ debtId: "gas-s", amountCents: 2000 }],
		});

		const result = await loadBillVerification(client);
		assert.deepEqual(
			result.bills.map((bill) => [bill.id, bill.status]),
			[
				["clean", "unpaid"],
				["gas", "part"],
			],
		);
		const gas = result.bills[1];
		assert.equal(gas.name, "AGL Gas");
		assert.equal(gas.category, "gas");
		assert.equal(gas.dueAt, time - 10);
		assert.equal(gas.amountCents, 15000);
		assert.equal(gas.paidCents, 12000);
		assert.equal(gas.remainingCents, 3000);

		const [oliverShare, sarahShare] = gas.shares;
		assert.equal(oliverShare.housemateName, "Oliver Caprile");
		assert.equal(oliverShare.paidCents, 10000);
		assert.equal(oliverShare.remainingCents, 0);
		assert.equal(oliverShare.receipts.length, 1);
		assert.equal(oliverShare.receipts[0].amountCents, 10000);
		assert.equal(oliverShare.receipts[0].kind, "bank");
		assert.equal(
			oliverShare.receipts[0].description,
			"Mr Oliver William Caprile · Bills",
		);

		assert.equal(sarahShare.housemateName, "Sarah O Dwyer");
		assert.equal(sarahShare.paidCents, 2000);
		assert.equal(sarahShare.remainingCents, 3000);
		assert.equal(
			sarahShare.receipts[0].description,
			"Cash received · From Sarah",
		);
		assert.equal(sarahShare.receipts[0].kind, "cash");
		assert.equal(sarahShare.receipts[0].receivedAt, time - 5);

		const clean = result.bills[0];
		assert.equal(clean.category, "cleaning");
		assert.equal(clean.shares.length, 1);
		assert.equal(clean.shares[0].receipts.length, 0);

		assert.deepEqual(result.summary, {
			paid: 0,
			part: 1,
			unpaid: 1,
			check: 0,
			approved: 0,
			needsLook: 2,
			remainingCents: 6000,
		});
	}));

test("a bill is paid once every housemate share is, and approval toggles", async () =>
	fixture(async (client) => {
		await addShares(client, [
			["water-o", "oliver", "bill", 4000],
			["water-s", "sarah", "bill", 4000],
		]);
		await ingest(client, receipt("bank-2", 4000));
		await confirm(client, "bank-2", "oliver", [
			{ debtId: "water-o", amountCents: 4000 },
		]);
		assert.equal((await loadBillVerification(client)).bills[0].status, "part");
		await recordCash(client, {
			housemateId: "sarah",
			amountCents: 4000,
			receivedAt: time - 5,
			allocations: [{ debtId: "water-s", amountCents: 4000 }],
		});
		const paid = await loadBillVerification(client);
		assert.equal(paid.bills[0].status, "paid");
		assert.equal(paid.summary.paid, 1);
		assert.equal(paid.summary.remainingCents, 0);
		assert.equal(paid.bills[0].needsLook, true);

		await approveBill(client, "bill", true);
		await approveBill(client, "bill", true);
		const approved = await loadBillVerification(client);
		assert.equal(approved.bills[0].approved, true);
		assert.equal(approved.summary.approved, 1);
		assert.equal(approved.summary.needsLook, 0);
		await approveBill(client, "bill", false);
		assert.equal(await count(client, "SELECT count(*) n FROM bill_reviews"), 0);
	}));
