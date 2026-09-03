CREATE TABLE `github_installation` (
	`id` integer PRIMARY KEY,
	`user_id` text NOT NULL,
	`account_login` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_github_installation_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `github_installation_user_id_idx` ON `github_installation` (`user_id`);