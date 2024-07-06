CREATE TABLE `blocks` (
	`number` integer PRIMARY KEY NOT NULL,
	`hash` text(64) NOT NULL,
	`leading_zeros` integer NOT NULL,
	`target_number` integer NOT NULL,
	`epoch_time` integer NOT NULL,
	`current_posix_time` integer NOT NULL,
	`nonce` text(32)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocks_hash_unique` ON `blocks` (`hash`);