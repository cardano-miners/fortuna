pub type HardForkStatus {
  NotForked
  Forked
  FailedFork
}

pub type ForkDatum {
  HardForkState {
    status: HardForkStatus,
    fork_block_height: Int,
    fortuna_next_spend_hash: ByteArray,
    fortuna_next_mint_hash: ByteArray,
  }
  MinerLockState { locked_tuna: Int, block_signals: Int }
  LockState { locked_tuna: Int }
  NftState { nft_key: ByteArray }
}

pub type LockAction {
  MinerLock { fortuna_v1_output: Int }
  UserLock
}
