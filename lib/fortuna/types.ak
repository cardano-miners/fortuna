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
  mining_state: MineState,
  extra: ExtraState,
}

pub type MineState {
  block_number: Int,
  current_hash: ByteArray,
  leading_zeros: Int,
  target_number: Int,
  epoch_time: Int,
  current_posix_time: Int,
}

pub type NominatedVote {
  /// The current amount of miner votes for the current nomination token.
  vote_count: Int,
  /// The block height where the nomination token is burned.
  vote_deadline: Int,
}

pub type ExtraState {
  new_spend_votes: Option<NominatedVote>,
  merkle: ByteArray,
  extra: Data,
}
