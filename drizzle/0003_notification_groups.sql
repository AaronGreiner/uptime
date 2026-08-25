CREATE TABLE `monitor_group_notification_groups` (
	`monitor_group_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	PRIMARY KEY(`monitor_group_id`, `group_id`),
	FOREIGN KEY (`monitor_group_id`) REFERENCES `monitor_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `notification_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `monitor_notification_groups` (
	`monitor_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	PRIMARY KEY(`monitor_id`, `group_id`),
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `notification_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` integer NOT NULL,
	`group_id` integer,
	`monitor_id` integer NOT NULL,
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
CREATE INDEX `notification_deliveries_due_idx` ON `notification_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_monitor_idx` ON `notification_deliveries` (`monitor_id`,`channel_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_group_channels` (
	`group_id` integer NOT NULL,
	`channel_id` integer NOT NULL,
	PRIMARY KEY(`group_id`, `channel_id`),
	FOREIGN KEY (`group_id`) REFERENCES `notification_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notification_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`notify_down` integer DEFAULT true NOT NULL,
	`notify_up` integer DEFAULT true NOT NULL,
	`notify_certificate_expiring` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_groups_default_idx` ON `notification_groups` (`is_default`);--> statement-breakpoint
ALTER TABLE `monitor_groups` ADD `notification_mode` text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitors` ADD `notification_mode` text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_channels` ADD `language` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_channels` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_channels` ADD `last_success_at` integer;--> statement-breakpoint
ALTER TABLE `notification_channels` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `notification_channels` ADD `last_error_at` integer;