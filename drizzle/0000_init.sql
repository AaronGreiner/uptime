CREATE TABLE `dashboard_widgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dashboard_id` integer NOT NULL,
	`type` text NOT NULL,
	`monitor_id` integer,
	`config` text DEFAULT '{}' NOT NULL,
	`layout` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dashboard_widgets_dashboard_idx` ON `dashboard_widgets` (`dashboard_id`);--> statement-breakpoint
CREATE TABLE `dashboards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_default` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dashboards_slug_unique` ON `dashboards` (`slug`);--> statement-breakpoint
CREATE TABLE `heartbeats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`checked_at` integer NOT NULL,
	`status` text NOT NULL,
	`latency_ms` integer,
	`status_code` integer,
	`message` text,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `heartbeats_monitor_checked_idx` ON `heartbeats` (`monitor_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `monitor_notification_channels` (
	`monitor_id` integer NOT NULL,
	`channel_id` integer NOT NULL,
	PRIMARY KEY(`monitor_id`, `channel_id`),
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `monitor_state` (
	`monitor_id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_checked_at` integer,
	`next_check_at` integer,
	`latency_ms` integer,
	`message` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`consecutive_successes` integer DEFAULT 0 NOT NULL,
	`certificate_expires_at` integer,
	`certificate_checked_at` integer,
	`status_changed_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `monitor_state_next_check_idx` ON `monitor_state` (`next_check_at`);--> statement-breakpoint
CREATE TABLE `monitor_stats_hourly` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`bucket_start` integer NOT NULL,
	`up_count` integer DEFAULT 0 NOT NULL,
	`down_count` integer DEFAULT 0 NOT NULL,
	`avg_latency_ms` integer,
	`min_latency_ms` integer,
	`max_latency_ms` integer,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `monitor_stats_hourly_bucket_idx` ON `monitor_stats_hourly` (`bucket_start`);--> statement-breakpoint
CREATE UNIQUE INDEX `monitor_stats_hourly_bucket_unq` ON `monitor_stats_hourly` (`monitor_id`,`bucket_start`);--> statement-breakpoint
CREATE TABLE `monitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`interval_seconds` integer DEFAULT 60 NOT NULL,
	`timeout_seconds` integer DEFAULT 10 NOT NULL,
	`retries` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`method` text DEFAULT 'GET' NOT NULL,
	`headers` text DEFAULT '{}' NOT NULL,
	`body` text,
	`expected_status_codes` text DEFAULT '200-299' NOT NULL,
	`keyword` text,
	`keyword_inverted` integer DEFAULT false NOT NULL,
	`follow_redirects` integer DEFAULT true NOT NULL,
	`ignore_tls` integer DEFAULT false NOT NULL,
	`check_certificate_expiry` integer DEFAULT true NOT NULL,
	`certificate_expiry_warning_days` integer DEFAULT 14 NOT NULL,
	`hostname` text DEFAULT '' NOT NULL,
	`packet_count` integer DEFAULT 3 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `monitors_active_idx` ON `monitors` (`active`);--> statement-breakpoint
CREATE TABLE `notification_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);