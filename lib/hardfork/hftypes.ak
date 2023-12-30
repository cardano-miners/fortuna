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
  MinerLock { fortuna_v1_output: Int, ownership_key_index: Option<Int> }
  LockInit
  LockMore { ownership_key_index: Int }
}
