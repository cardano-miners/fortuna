CREATE TABLE `blocks` (
	`number` integer PRIMARY KEY NOT NULL,
	`hash` text(64) NOT NULL,
	`leading_zeros` integer NOT NULL,
	`target_number` integer NOT NULL,
	`epoch_time` integer NOT NULL,
	`current_posix_time` integer NOT NULL,
	`nonce` text(64),
	`miner_cred` text,
	`nft_cred` text(120),
	`data` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocks_hash_unique` ON `blocks` (`hash`);