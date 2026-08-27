ALTER TABLE `heartbeats` ADD `reported_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
WITH `grouped_heartbeats` AS (
	SELECT
		`heartbeats`.`id`,
		`heartbeats`.`monitor_id`,
		`heartbeats`.`checked_at`,
		`heartbeats`.`status`,
		`monitors`.`retries`,
		sum(CASE WHEN `heartbeats`.`status` = 'up' THEN 1 ELSE 0 END) OVER (
			PARTITION BY `heartbeats`.`monitor_id`
			ORDER BY `heartbeats`.`checked_at`, `heartbeats`.`id`
			ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
		) AS `success_group`
	FROM `heartbeats`
	INNER JOIN `monitors` ON `monitors`.`id` = `heartbeats`.`monitor_id`
),
`sequenced_heartbeats` AS (
	SELECT
		`id`,
		`status`,
		`retries`,
		sum(CASE WHEN `status` = 'down' THEN 1 ELSE 0 END) OVER (
			PARTITION BY `monitor_id`, `success_group`
			ORDER BY `checked_at`, `id`
			ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
		) AS `consecutive_failures`
	FROM `grouped_heartbeats`
)
UPDATE `heartbeats`
SET `reported_status` = (
	SELECT CASE
		WHEN `sequenced_heartbeats`.`status` = 'up' THEN 'up'
		WHEN `sequenced_heartbeats`.`consecutive_failures` > `sequenced_heartbeats`.`retries` THEN 'down'
		ELSE 'pending'
	END
	FROM `sequenced_heartbeats`
	WHERE `sequenced_heartbeats`.`id` = `heartbeats`.`id`
);
