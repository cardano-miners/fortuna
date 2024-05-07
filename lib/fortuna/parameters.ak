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
  #"f0eb964a37dea6f59de5d19896f82233f13031a2799027b666f7f5796ee5cd09"

pub const voting_days = 7

/// Minimum supply threshold for the upgrade contract vote to be successful
/// In thousandth percentage i.e. 250 = 25%
pub const supply_threshold = 250

/// Minimum yes votes over no votes for the upgrade contract vote to be successful
pub const vote_threshold = 666

/// Minimum number of miners to vote for the upgrade contract vote to be successful
/// Must be within a epoch time frame i.e. epoch_number
pub const miner_threshold = 850
