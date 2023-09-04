pub type State {
  block_number: Int,
  current_hash: ByteArray,
  leading_zeros: Int,
  difficulty_number: Int,
  epoch_time: Int,
  current_posix_time: Int,
  extra: Data,
  interlink: List<Data>,
}
