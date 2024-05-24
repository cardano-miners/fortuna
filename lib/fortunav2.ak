use aiken/builtin
use aiken/bytearray
use aiken/dict
use aiken/list
use aiken/pairs
use aiken/transaction.{Input, Output, Transaction} as tx
use aiken/transaction/credential.{
  Address, Inline, ScriptCredential, StakeCredential,
}
use aiken/transaction/value.{AssetName, PolicyId}
use fortuna.{master_token_name}
use fortuna/parameters.{latest_merkle_root, voting_days}
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
      |> dict.to_pairs

  let fork_purpose = tx.WithdrawFrom(Inline(ScriptCredential(fork_script_hash)))

  expect Some(fork_redeemer) = pairs.get_first(tx.redeemers, fork_purpose)

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

// Voting and governance functions

pub fn voting_period() -> Int {
  1000 * 60 * 60 * 24 * voting_days
}

/// Flips the bits of a hash
pub fn flip_hash(hash: ByteArray) -> ByteArray {
  do_flip_hash(hash, #[], bytearray.length(hash))
}

fn do_flip_hash(hash: ByteArray, new_hash: ByteArray, index: Int) -> ByteArray {
  if index == 0 {
    new_hash
  } else {
    do_flip_hash(
      hash,
      hash
        |> builtin.index_bytearray(index - 1)
        |> builtin.subtract_integer(255, _)
        |> builtin.cons_bytearray(new_hash),
      index - 1,
    )
  }
}

fn mini_loop(assets: Pairs<AssetName, Int>, script_hash: AssetName) -> Int {
  when assets is {
    [] -> 0
    [Pair(asset, quantity), ..rest] ->
      if asset == script_hash {
        quantity
      } else {
        mini_loop(rest, script_hash)
      }
  }
}

fn quantity_of(
  value: Pairs<PolicyId, Pairs<AssetName, Int>>,
  own_hash: PolicyId,
  script_hash: AssetName,
) -> Int {
  when value is {
    [] -> 0
    [Pair(policy, assets), ..rest] ->
      if policy == own_hash {
        mini_loop(assets, script_hash)
      } else {
        quantity_of(rest, own_hash, script_hash)
      }
  }
}

pub fn count_votes(
  reference_inputs: List<Input>,
  own_hash: PolicyId,
  script_hash: AssetName,
  stake_cred: Option<StakeCredential>,
) -> Int {
  when reference_inputs is {
    [] -> 0
    [input, ..rest] -> {
      let Output { address, value, .. } = input.output

      if stake_cred == address.stake_credential {
        value.quantity_of(value, own_hash, fortuna.token_name) + count_votes(
          rest,
          own_hash,
          script_hash,
          stake_cred,
        )
      } else {
        when value |> value.tokens(own_hash) |> dict.to_pairs is {
          [Pair(tuna_name, tuna_quantity), Pair(value_script_hash, 1)] ->
            if
            tuna_name == fortuna.token_name && value_script_hash == script_hash{
            
              tuna_quantity + count_votes(
                rest,
                own_hash,
                script_hash,
                stake_cred,
              )
            } else {
              count_votes(rest, own_hash, script_hash, stake_cred)
            }

          _ -> count_votes(rest, own_hash, script_hash, stake_cred)
        }
      }
    }
  }
}
// A little experiment to see how the current optimizer handles the_counter function

// pub fn the_counter() {
//   super_optimize()
// }

// pub fn super_optimize() {
//   repeated_count_votes(10)
// }

// pub type FakeOutput {
//   address: Address,
//   value: Pairs<PolicyId, Pairs<AssetName, Int>>,
//   datum: Datum,
//   thing: Data,
// }

// pub type FakeInput {
//   thing: OutputReference,
//   output: FakeOutput,
// }

// pub fn repeated_count_votes(a: Int) {
//   if a == 0 {
//     fn(
//       reference_inputs: List<FakeInput>,
//       own_hash: PolicyId,
//       script_hash: AssetName,
//       stake_cred: Option<StakeCredential>,
//     ) {
//       count_votes(reference_inputs, own_hash, script_hash, stake_cred)
//     }
//   } else {
//     fn(
//       reference_inputs: List<FakeInput>,
//       own_hash: PolicyId,
//       script_hash: AssetName,
//       stake_cred: Option<StakeCredential>,
//     ) {
//       when reference_inputs is {
//         [] -> 0
//         [input, ..rest] -> {
//           let FakeOutput { address, value, .. } = input.output

//           let x =
//             if stake_cred == address.stake_credential {
//               quantity_of(value, own_hash, script_hash)
//             } else if quantity_of(value, own_hash, script_hash) == 1 {
//               quantity_of(value, own_hash, script_hash)
//             } else {
//               0
//             }

//           x + repeated_count_votes(a - 1)(
//             rest,
//             own_hash,
//             script_hash,
//             stake_cred,
//           )
//         }
//       }
//     }
//   }
// }
