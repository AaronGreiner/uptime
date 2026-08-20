CREATE TABLE `monitor_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`parent_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `monitor_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `monitor_groups_parent_idx` ON `monitor_groups` (`parent_id`);--> statement-breakpoint
ALTER TABLE `monitors` ADD `group_id` integer REFERENCES monitor_groups(id);--> statement-breakpoint
CREATE INDEX `monitors_group_idx` ON `monitors` (`group_id`);