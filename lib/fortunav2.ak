use aiken/alist
use aiken/builtin
use aiken/bytearray
use aiken/dict
use aiken/list
use aiken/transaction.{Transaction} as tx
use aiken/transaction/credential.{Inline, ScriptCredential}
use aiken/transaction/value
use fortuna.{master_token_name}
use fortuna/parameters.{latest_merkle_root}
use fortuna/types.{State, Statev2}
use fortuna/utils.{get_inline_datum, integer_to_bytes, list_at}
use hardfork/hftypes.{HardFork, NftForkAction}

pub const big_tuna_prefix = "TUNA"

pub const counter_prefix = "COUNTER"

pub const nominated_prefix = "NOMA"

pub fn genesis_v2(tx, own_policy, fortuna_v1_hash: Data, fork_script_hash: Data) {
  let Transaction { reference_inputs, outputs, mint, .. } = tx

  expect fortuna_v1_hash: ByteArray = fortuna_v1_hash
  expect fork_script_hash: ByteArray = fork_script_hash

  // 2 tokens minted
  expect [Pair(_, 1), Pair(_, 1)] =
    mint
      |> value.from_minted_value
      |> value.tokens(own_policy)
      |> dict.to_alist

  let fork_purpose = tx.WithdrawFrom(Inline(ScriptCredential(fork_script_hash)))

  expect Some(fork_redeemer) = alist.get_first(tx.redeemers, fork_purpose)

  // By looking at the other contract redeemer action that can only run once,
  // We can ensure this action only runs once.
  expect HardFork { lock_output_index }: NftForkAction = fork_redeemer

  let tunav2_output = list_at(outputs, lock_output_index + 1)

  expect Some(v1_miner_ref) = {
    let input <- list.find(reference_inputs)
    input.output.value
      |> value.quantity_of(fortuna_v1_hash, master_token_name)
      |> builtin.equals_integer(1)
  }

  expect State {
    block_number,
    current_hash,
    leading_zeros,
    target_number,
    epoch_time,
    current_posix_time,
    ..
  }: State = get_inline_datum(v1_miner_ref.output.datum)

  let expected_mine_state: Data =
    Statev2 {
      block_number,
      current_hash,
      leading_zeros: leading_zeros - 2,
      target_number,
      epoch_time,
      current_posix_time,
      merkle_root: latest_merkle_root,
    }

  let mine_state = get_inline_datum(tunav2_output.datum)

  expect ScriptCredential(spend_hash) = tunav2_output.address.payment_credential

  let expected_value =
    value.from_asset(
      own_policy,
      bytearray.concat(big_tuna_prefix, spend_hash),
      1,
    )
      |> value.add(
          own_policy,
          bytearray.concat(counter_prefix, integer_to_bytes(block_number, #"")),
          1,
        )

  and {
    mine_state == expected_mine_state,
    tunav2_output.value
      |> value.without_lovelace
      |> builtin.equals_data(expected_value),
  }
}
/// Voting and governance functions
