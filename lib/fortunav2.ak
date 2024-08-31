use aiken/builtin
use aiken/bytearray
use aiken/dict.{Dict}
use aiken/interval.{Finite}
use aiken/list
use aiken/transaction.{InlineDatum,
  Input, Output, OutputReference, Transaction} as tx
use aiken/transaction/credential.{
  Address, Inline, ScriptCredential, StakeCredential,
}
use aiken/transaction/value.{AssetName, PolicyId, Value}
use fortuna.{master_token_name}
use fortuna/parameters.{latest_merkle_root, voting_days}
use fortuna/types.{Nominated, State, Statev2, TunaUpgradeProcess}
use fortuna/utils.{
  get_inline_datum, integer_to_bytes, list_at, resolve_output_reference,
}
use hardfork/hftypes.{HardFork, NftForkAction}

pub const big_tuna_prefix = "TUNA"

pub const big_tuna_length = 4

pub const counter_prefix = "COUNTER"

pub const counter_length = 7

pub const nominated_prefix = "NOMA"

pub fn genesis_v2(tx, own_policy, fortuna_v1_hash: Data, fork_script_hash: Data) {
  let Transaction { reference_inputs, outputs, mint, .. } = tx

  expect fortuna_v1_hash: ByteArray = fortuna_v1_hash
  expect fork_script_hash: ByteArray = fork_script_hash

  // 2 tokens minted
  expect [Pair(_, 1), Pair(_, 1)] =
    mint
      |> value.from_minted_value
      |> tokens(own_policy)

  let fork_purpose = tx.WithdrawFrom(Inline(ScriptCredential(fork_script_hash)))

  let fork_redeemer = expect_first(tx.redeemers, fork_purpose)

  // By looking at the other contract redeemer action that can only run once,
  // We can ensure this action only runs once.
  expect HardFork { lock_output_index }: NftForkAction = fork_redeemer

  // We can assume the next output is the one we look at
  let tunav2_output = list_at(outputs, lock_output_index + 1)

  // Need to reference Fortuna V1 to get the current state
  expect Some(v1_miner_ref) = {
    let input <- list.find(reference_inputs)
    input.output.value
      |> value.to_dict
      |> dict.to_pairs
      |> quantity_of(fortuna_v1_hash, master_token_name)
      |> builtin.equals_integer(1)
  }

  // The only place where State type is used in the minter
  expect State {
    block_number,
    current_hash,
    leading_zeros,
    target_number,
    epoch_time,
    current_posix_time,
    ..
  }: State = get_inline_datum(v1_miner_ref.output.datum)

  // The only place where Statev2 type is used in the minter
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
          bytearray.concat(counter_prefix, integer_to_bytes(block_number, "")),
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
// TODO change back to normal before launch
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

pub fn quantity_of(
  value: Pairs<PolicyId, Dict<AssetName, Int>>,
  own_hash: PolicyId,
  script_hash: AssetName,
) -> Int {
  when value is {
    [] -> 0
    [Pair(policy, assets), ..rest] ->
      if policy == own_hash {
        mini_loop(assets |> dict.to_pairs, script_hash)
      } else {
        quantity_of(rest, own_hash, script_hash)
      }
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

pub fn vote(
  for: Bool,
  own_ref: OutputReference,
  tx: Transaction,
  dat: TunaUpgradeProcess,
) {
  let Transaction { inputs, outputs, reference_inputs, validity_range, .. } = tx

  expect Nominated {
    script_hash,
    deadline,
    for_count,
    anti_script_hash,
    against_count,
  } = dat

  let check_hash =
    if for {
      script_hash
    } else {
      anti_script_hash
    }

  let Output { address: in_address, value: in_value, .. } =
    resolve_output_reference(inputs, own_ref)

  expect ScriptCredential(own_hash) = in_address.payment_credential

  expect Finite(upper_range) = validity_range.upper_bound.bound_type

  let Output { address: out_address, value: out_value, datum: out_datum, .. } =
    utils.list_at(outputs, 0)

  let votes_in_tx =
    count_votes(
      reference_inputs,
      own_hash,
      check_hash,
      Some(Inline(ScriptCredential(check_hash))),
    )

  let expected_datum =
    InlineDatum(
      Nominated {
        script_hash,
        for_count: if for {
          votes_in_tx
        } else {
          for_count
        },
        anti_script_hash,
        against_count: if for {
          against_count
        } else {
          votes_in_tx
        },
        deadline,
      },
    )

  and {
    (quantity_of(
      in_value |> value.to_dict |> dict.to_pairs,
      own_hash,
      bytearray.concat(nominated_prefix, script_hash),
    ) == 1)?,
    (in_address == out_address)?,
    (upper_range <= deadline)?,
    (value.without_lovelace(in_value) == value.without_lovelace(out_value))?,
    if for {
      votes_in_tx > for_count
    } else {
      votes_in_tx > against_count
    }?,
    (expected_datum == out_datum)?,
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
        quantity_of(
          value |> value.to_dict |> dict.to_pairs,
          own_hash,
          fortuna.token_name,
        ) + count_votes(rest, own_hash, script_hash, stake_cred)
      } else {
        when value |> tokens2(own_hash) is {
          [Pair(name1, quantity1), Pair(name2, quantity2)] ->
            if and {
              name1 == script_hash,
              quantity1 == 1,
              name2 == fortuna.token_name,
            } {
              quantity2
            } else if and {
              name2 == script_hash,
              quantity2 == 1,
              name1 == fortuna.token_name,
            } {
              quantity1
            } else {
              0
            } + count_votes(rest, own_hash, script_hash, stake_cred)
          _ -> count_votes(rest, own_hash, script_hash, stake_cred)
        }
      }
    }
  }
}

pub fn expect_first(self: Pairs<key, value>, key k: key) -> value {
  when self is {
    [] -> fail
    [Pair(k2, v), ..rest] ->
      if k == k2 {
        v
      } else {
        expect_first(rest, k)
      }
  }
}

pub fn tokens(value: Value, own_policy: PolicyId) -> Pairs<AssetName, Int> {
  value
    |> value.to_dict()
    |> dict.to_pairs()
    |> expect_first(own_policy)
    |> dict.to_pairs()
}

fn tokens2(self: Value, own_policy: PolicyId) -> Pairs<AssetName, Int> {
  self
    |> value.to_dict()
    |> dict.to_pairs()
    |> loop_tokens(own_policy)
}

fn loop_tokens(
  self: Pairs<PolicyId, Dict<AssetName, Int>>,
  own_policy: PolicyId,
) -> Pairs<AssetName, Int> {
  when self is {
    [] ->
      []
    [Pair(k2, v), ..rest] ->
      if own_policy == k2 {
        v |> dict.to_pairs()
      } else {
        loop_tokens(rest, own_policy)
      }
  }
}
