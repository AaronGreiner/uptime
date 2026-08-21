CREATE TABLE `__new_dashboard_widgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dashboard_id` integer NOT NULL,
	`type` text NOT NULL,
	`monitor_id` integer,
	`config` text DEFAULT '{}' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`width` text DEFAULT 'half' NOT NULL,
	`height` text DEFAULT 'standard' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_dashboard_widgets` (
	`id`,
	`dashboard_id`,
	`type`,
	`monitor_id`,
	`config`,
	`position`,
	`width`,
	`height`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`dashboard_id`,
	`type`,
	`monitor_id`,
	`config`,
	ROW_NUMBER() OVER (PARTITION BY `dashboard_id` ORDER BY `id`) - 1,
	CASE `type`
		WHEN 'monitor' THEN 'third'
		WHEN 'uptime-summary' THEN 'quarter'
		WHEN 'latency-chart' THEN 'half'
		WHEN 'status-overview' THEN 'full'
		WHEN 'heading' THEN 'full'
		ELSE 'half'
	END,
	CASE `type`
		WHEN 'monitor' THEN 'standard'
		WHEN 'uptime-summary' THEN 'compact'
		WHEN 'latency-chart' THEN 'standard'
		WHEN 'status-overview' THEN 'compact'
		WHEN 'heading' THEN 'slim'
		ELSE 'standard'
	END,
	`created_at`,
	`updated_at`
FROM `dashboard_widgets`;
--> statement-breakpoint
DROP TABLE `dashboard_widgets`;
--> statement-breakpoint
ALTER TABLE `__new_dashboard_widgets` RENAME TO `dashboard_widgets`;
--> statement-breakpoint
CREATE INDEX `dashboard_widgets_dashboard_idx` ON `dashboard_widgets` (`dashboard_id`);
