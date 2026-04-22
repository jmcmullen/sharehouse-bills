DROP INDEX `bills_pdf_sha256_idx`;--> statement-breakpoint
CREATE INDEX `bills_pdf_sha256_idx` ON `bills` (`pdf_sha256`);