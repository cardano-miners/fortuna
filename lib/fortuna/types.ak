use aiken/transaction.{OutputReference}

/// State Data stored on chain.
/// Used by the validator to check the next state.
pub type State {
  block_number: Int,
  current_hash: ByteArray,
  leading_zeros: Int,
  target_number: Int,
  epoch_time: Int,
  current_posix_time: Int,
  extra: Data,
  interlink: List<Data>,
}

/// Statev2 Data stored on chain.
/// Used by the validator to check the next state.
pub type Statev2 {
  block_number: Int,
  current_hash: ByteArray,
  leading_zeros: Int,
  target_number: Int,
  epoch_time: Int,
  current_posix_time: Int,
  merkle_root: ByteArray,
}

pub type TunaAction {
  Genesis
  MineTuna(OutputReference, Int)
  Redeem
  NominateUpgrade(ByteArray, Int)
  VotingToken(OutputReference)
  BurnToken
  FinalizeNomination(OutputReference, OutputReference, Int, Int)
}

pub type TunaUpgradeProcess {
  Nominated {
    script_hash: ByteArray,
    for_count: Int,
    anti_script_hash: ByteArray,
    against_count: Int,
    deadline: Int,
  }
  Mining {
    script_hash: ByteArray,
    miner_support_count: Int,
    block_height_deadline: Int,
  }
}
