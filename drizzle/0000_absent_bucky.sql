CREATE TABLE `customer_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`created_at` integer NOT NULL,
	`intent` text NOT NULL,
	`services` text NOT NULL,
	`representative_name` text NOT NULL,
	`representative_company` text NOT NULL,
	`representative_email` text NOT NULL,
	`representative_phone` text NOT NULL,
	`representative_code` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_phone` text NOT NULL,
	`contact_preference` text NOT NULL,
	`overall_rating` integer,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_submissions_reference_unique` ON `customer_submissions` (`reference`);