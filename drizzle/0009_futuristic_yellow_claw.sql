PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notification_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` integer NOT NULL,
	`group_id` integer,
	`monitor_id` integer,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`delivered_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `notification_groups`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_notification_deliveries`("id", "channel_id", "group_id", "monitor_id", "event_type", "payload", "status", "attempts", "next_attempt_at", "last_error", "created_at", "delivered_at") SELECT "id", "channel_id", "group_id", "monitor_id", "event_type", "payload", "status", "attempts", "next_attempt_at", "last_error", "created_at", "delivered_at" FROM `notification_deliveries`;--> statement-breakpoint
DROP TABLE `notification_deliveries`;--> statement-breakpoint
ALTER TABLE `__new_notification_deliveries` RENAME TO `notification_deliveries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `notification_deliveries_due_idx` ON `notification_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_monitor_idx` ON `notification_deliveries` (`monitor_id`,`channel_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `notification_groups` ADD `notify_instance_offline` integer DEFAULT true NOT NULL;