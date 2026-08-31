CREATE TABLE `maintenance_windows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`note` text,
	`monitor_id` integer,
	`monitor_group_id` integer,
	`weekdays` integer DEFAULT 0 NOT NULL,
	`start_minute` integer DEFAULT 0 NOT NULL,
	`duration_minutes` integer DEFAULT 30 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`monitor_group_id`) REFERENCES `monitor_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maintenance_windows_monitor_idx` ON `maintenance_windows` (`monitor_id`);--> statement-breakpoint
CREATE INDEX `maintenance_windows_group_idx` ON `maintenance_windows` (`monitor_group_id`);--> statement-breakpoint
ALTER TABLE `monitor_groups` ADD `maintenance_started_at` integer;--> statement-breakpoint
ALTER TABLE `monitor_groups` ADD `maintenance_until` integer;--> statement-breakpoint
ALTER TABLE `monitor_stats_hourly` ADD `maintenance_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitors` ADD `maintenance_started_at` integer;--> statement-breakpoint
ALTER TABLE `monitors` ADD `maintenance_until` integer;--> statement-breakpoint
-- `paused` is no longer a value the state machine stores: it is decided when
-- the row is read, from the monitor's `active` flag, the same way `maintenance`
-- now is. Rows written before that keep their last real result instead.
UPDATE `monitor_state` SET `status` = 'pending' WHERE `status` = 'paused';
