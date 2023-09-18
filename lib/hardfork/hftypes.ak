pub type HardForkStatus {
  NotForked
  Forked
  FailedFork
}

pub type LockStateType {
  MinerOp(ByteArray)
  Regular
}

pub type ForkDatum {
  HardForkState { status: HardForkStatus, fork_block_height: Int }
  GlobalLockState { locked_tuna: Int, lock_state_type: LockStateType }
  NftState { nft_key: ByteArray }
}
