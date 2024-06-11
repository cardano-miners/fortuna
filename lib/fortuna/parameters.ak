/// Bitcoin constants imagined by Satoshi Nakamoto
pub const halving_number = 210000

pub const epoch_number = 2016

/// The target time for each epoch to be mined in milliseconds
pub const epoch_target = 1_209_600_000

pub const initial_payout = 5000000000

/// Padding for integer division. Went with 4 bit padding for ease
pub const padding = 16

// New Params for V2

pub const latest_merkle_root =
  #"4fdcf1ae84ccbe49b7b2b9cc8e2ef1ef0ac7b380b8c3a3abe06abb8a30878d32"

// pub const latest_merkle_root =
//   #"08f6adda95e55efab85705f7b3313559db6750f5d7385de9b11d932a8db86204"

pub const voting_days = 14

/// Minimum supply threshold for the upgrade contract vote to be successful
/// In thousandth percentage i.e. 250 = 25%
pub const supply_threshold = 250

/// Minimum yes votes over no votes for the upgrade contract vote to be successful
pub const vote_threshold = 666

/// Minimum number of miners to vote for the upgrade contract vote to be successful
/// Must be within a epoch time frame i.e. epoch_number
pub const miner_threshold = 850
