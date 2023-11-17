use aiken/transaction.{OutputReference}

pub type HardForkStatus {
  NotForked
  Forked
  FailedFork
}

pub type ForkDatum {
  HardForkState {
    status: HardForkStatus,
    fork_block_height: Int,
    fortuna_next_validator_hash: ByteArray,
  }
  MinerLockState { locked_tuna: Int, block_signals: Int }
  LockState { locked_tuna: Int }
  NftState { nft_key: ByteArray }
}

pub type LockAction {
  MinerLockInit { fortuna_v1_output: Int }
  MinerLockMore {
    fortuna_v1_output: Int,
    nft_input_ref: OutputReference,
    output_key_index: Int,
  }
  LockInit
  LockMore { nft_input_ref: OutputReference, output_key_index: Int }
}
