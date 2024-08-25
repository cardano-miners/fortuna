/// Bitcoin constants imagined by Satoshi Nakamoto
pub const halving_number = 210000

pub const initial_payout = 5000000000

// The number of blocks in an epoch. After each epoch the
// difficulty changes
pub const epoch_number = 504

/// The target time for each epoch to be mined in milliseconds
pub const epoch_target = 302_400_000

/// Padding for integer division. Went with 4 bit padding for ease
pub const padding = 16

pub const max_difficulty_adjustment = 4

// New Params for V2
// pub const latest_merkle_root =
//   #"4d564ab67ab1594042747cbae9fd17da7c0e4241bad0ad6532dcb5620792eca1"

pub const latest_merkle_root =
  #"f54bf42f82f753f02535fd249e0d0605c2dfa3d5f2f8903c249fafed054ab4d3"

// Amount of days for a token holder to vote on a new upgrade contract
pub const voting_days = 14

/// Minimum supply threshold for the upgrade contract vote to be successful
/// In thousandth percentage i.e. 200 = 20%
pub const supply_threshold = 200

/// Minimum yes votes over no votes for the upgrade contract vote to be successful
pub const vote_threshold = 666

/// Minimum number of miners to vote for the upgrade contract vote to be successful
/// Must be within a miner voting period
pub const miner_threshold = 850

/// Number of blocks where voters can vote for a particular script
/// as they mine Fortuna
pub const miner_voting_period = 2016
