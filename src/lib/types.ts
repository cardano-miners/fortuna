export type BlockData = {
  block_number: number;
  current_hash: string;
  leading_zeros: number;
  target_number: number;
  epoch_time: number;
  current_posix_time: number;
  // only the genesis block has an undefined nonce
  nonce?: string;
};
