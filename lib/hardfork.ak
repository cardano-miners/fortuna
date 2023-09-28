use aiken/math
use aiken/transaction.{InlineDatum, Output}
use aiken/transaction/value.{Value}
use fortuna/parameters.{halving_number, initial_payout}
use fortuna/types.{State}
use fortuna/utils.{quantity_of}
use hardfork/hftypes.{
  ForkDatum, GlobalLockState, LockStateType, MinerOp, Regular,
}

pub fn calculate_emission(block_height: Int) -> Int {
  if block_height < halving_number {
    block_height * initial_payout
  } else {
    block_height * initial_payout + do_calculate_emission(
      block_height - halving_number,
      1,
    )
  }
}

fn do_calculate_emission(block_height: Int, halving_epoch: Int) -> Int {
  if block_height < halving_number {
    block_height * initial_payout / math.pow2(halving_epoch)
  } else {
    block_height * initial_payout / math.pow2(halving_epoch) + do_calculate_emission(
      block_height - halving_number,
      halving_epoch + 1,
    )
  }
}
