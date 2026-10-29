CREATE TABLE `site_qr_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`destination` text NOT NULL,
	`asset_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`version` text NOT NULL,
	`mode` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
