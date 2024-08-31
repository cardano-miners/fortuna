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
	`data` text,
	`cardano_tx_hash` text(64) NOT NULL,
	`cardano_slot` integer NOT NULL,
	`cardano_hash` text(64) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocks_hash_unique` ON `blocks` (`hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `blocks_cardano_tx_hash_unique` ON `blocks` (`cardano_tx_hash`);