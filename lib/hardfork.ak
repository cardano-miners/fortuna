use aiken/builtin.{blake2b_256}
use aiken/dict
use aiken/list
use aiken/math
use aiken/transaction.{InlineDatum, Input, Output, OutputReference, Transaction}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value.{Value, tokens}
use fortuna
use fortuna/parameters.{halving_number, initial_payout}
use fortuna/types.{State}
use fortuna/utils.{list_at, quantity_of}
use hardfork/hftypes.{
  FailedFork, ForkDatum, Forked, HardForkState, LockAction, LockInit, LockMore,
  LockState, MinerLockInit, MinerLockMore, MinerLockState, NftState, NotForked,
}
use hardfork/params.{
  miner_hardfork_threshold, tuna_count_blocks_from,
  tuna_hardfork_threshold_denominator, tuna_hardfork_threshold_numerator,
}

pub const miner_lock_state_token: ByteArray = "miner_lock_state"

pub const lock_state_token: ByteArray = "lock_state"

pub const hard_fork_state_token: ByteArray = "hfs"

pub fn initialize(
  initializer_input: OutputReference,
  transaction: Transaction,
  own_policy: ByteArray,
) -> Bool {
  let Transaction { inputs, outputs, mint, .. } = transaction

  let own_address =
    Address {
      payment_credential: ScriptCredential(own_policy),
      stake_credential: None,
    }

  let mint = value.from_minted_value(mint)

  let hfs_output = list_at(outputs, 0)
  let miner_state_output = list_at(outputs, 1)
  let lock_state_output = list_at(outputs, 2)

  // The reason we check minted amount but not token name 
  // is because we check the token names and presence in the outputs back to this script
  // Plus this action can only be run once in the lifetime of this script
  expect [(_, 1), (_, 1), (_, 1)] = mint |> tokens(own_policy) |> dict.to_list

  let genesis_input = utils.resolve_output_reference(inputs, initializer_input)

  let Output { address: hfs_address, value: hfs_value, datum: hfs_datum, .. } =
    hfs_output

  let Output {
    address: miner_state_address,
    value: miner_state_value,
    datum: miner_state_datum,
    ..
  } = miner_state_output

  let Output {
    address: lock_state_address,
    value: lock_state_value,
    datum: lock_state_datum,
    ..
  } = lock_state_output

  expect InlineDatum(hfs_datum) = hfs_datum
  expect InlineDatum(miner_state_datum) = miner_state_datum
  expect InlineDatum(lock_state_datum) = lock_state_datum

  expect HardForkState { status: NotForked, .. }: ForkDatum = hfs_datum

  expect MinerLockState { locked_tuna: 0, block_signals: 0 }: ForkDatum =
    miner_state_datum

  expect LockState { locked_tuna: 0 }: ForkDatum = lock_state_datum

  and {
    own_address == hfs_address,
    own_address == miner_state_address,
    own_address == lock_state_address,
    quantity_of(hfs_value, own_policy, hard_fork_state_token) == 1,
    quantity_of(miner_state_value, own_policy, miner_lock_state_token) == 1,
    quantity_of(lock_state_value, own_policy, lock_state_token) == 1,
    genesis_input == genesis_input,
  }
}

pub fn lock_not_forked(
  fortuna_v1_hash: ByteArray,
  lock_output_index: Int,
  nft_output_index: Int,
  lock_action: LockAction,
  transaction: Transaction,
  own_policy: ByteArray,
  fork_block_height: Int,
) -> Bool {
  let Transaction { inputs, outputs, mint, .. } = transaction

  let own_address =
    Address {
      payment_credential: ScriptCredential(own_policy),
      stake_credential: None,
    }

  let script_inputs =
    list.filter(inputs, fn(input) { input.output.address == own_address })

  when lock_action is {
    MinerLockInit { fortuna_v1_output } -> {
      // Use blake hash since it's faster and this is unrelated to Proof of Work
      let own_token_name =
        builtin.head_list(inputs).output_reference
          |> builtin.serialise_data
          |> blake2b_256

      // validate mint
      // Expect only 1 minted token
      expect [(minted_token, 1)] =
        mint
          |> value.from_minted_value
          |> value.tokens(own_policy)
          |> dict.to_list

      // Handle getting input state
      expect [Input { output: miner_lock_input, .. }] = script_inputs

      let Output { value: miner_lock_value, datum: miner_lock_datum, .. } =
        miner_lock_input

      expect InlineDatum(miner_lock_datum) = miner_lock_datum

      expect MinerLockState { locked_tuna, block_signals }: ForkDatum =
        miner_lock_datum

      // Handle getting output states
      let fortuna_v1_output = list_at(outputs, fortuna_v1_output)

      let Output { value: fortuna_v1_value, datum: fortuna_v1_datum, .. } =
        fortuna_v1_output

      expect InlineDatum(fortuna_v1_datum) = fortuna_v1_datum

      expect State { block_number, .. }: State = fortuna_v1_datum

      let (out_miner_lock_value, out_miner_lock_datum, out_nft_value, nft_datum) =
        get_output_lock_state(
          outputs,
          lock_output_index,
          nft_output_index,
          own_address,
        )

      expect MinerLockState {
        locked_tuna: out_locked_tuna,
        block_signals: out_block_signals,
      }: ForkDatum = out_miner_lock_datum

      expect NftState { nft_key }: ForkDatum = nft_datum

      let user_locked_tuna =
        quantity_of(out_nft_value, fortuna_v1_hash, fortuna.token_name)

      and {
        // Miner mined a valid fortuna v1 block
        quantity_of(
          fortuna_v1_value,
          fortuna_v1_hash,
          fortuna.master_token_name,
        ) == 1,
        // nft key at output datum has same token name as minted nft key
        nft_key == own_token_name,
        minted_token == own_token_name,
        // Miner locked at least some tuna
        user_locked_tuna > 0,
        // Miner lock state is updated correctly
        out_locked_tuna == user_locked_tuna + locked_tuna,
        check_block_signal(
          block_number,
          fork_block_height,
          block_signals,
          out_block_signals,
        ),
        // Miner lock value is correct
        value.without_lovelace(out_miner_lock_value) == value.without_lovelace(
          miner_lock_value,
        ),
        quantity_of(out_miner_lock_value, own_policy, miner_lock_state_token) == 1,
      }
    }

    MinerLockMore { fortuna_v1_output, nft_input_ref, output_key_index } -> {
      // validate mint
      expect [] =
        mint
          |> value.from_minted_value
          |> value.tokens(own_policy)
          |> dict.to_list

      // Handle getting input state
      expect [script_input1, script_input2] = script_inputs

      let (miner_lock_input, nft_input) =
        if script_input1.output_reference == nft_input_ref {
          (script_input2.output, script_input1.output)
        } else {
          (script_input1.output, script_input2.output)
        }

      let Output { value: miner_lock_value, datum: miner_lock_datum, .. } =
        miner_lock_input

      expect InlineDatum(miner_lock_datum) = miner_lock_datum

      expect MinerLockState { locked_tuna, block_signals }: ForkDatum =
        miner_lock_datum

      let Output { value: nft_value, datum: nft_datum, .. } = nft_input

      expect InlineDatum(nft_datum) = nft_datum

      expect NftState { nft_key }: ForkDatum = nft_datum

      // Handle getting output states
      let fortuna_v1_output = list_at(outputs, fortuna_v1_output)

      let Output { value: fortuna_v1_value, datum: fortuna_v1_datum, .. } =
        fortuna_v1_output

      expect InlineDatum(fortuna_v1_datum) = fortuna_v1_datum

      expect State { block_number, .. }: State = fortuna_v1_datum

      let (out_miner_lock_value, out_miner_lock_datum, out_nft_value, nft_datum) =
        get_output_lock_state(
          outputs,
          lock_output_index,
          nft_output_index,
          own_address,
        )

      expect MinerLockState {
        locked_tuna: out_locked_tuna,
        block_signals: out_block_signals,
      }: ForkDatum = out_miner_lock_datum

      expect NftState { nft_key: out_nft_key }: ForkDatum = nft_datum

      let proof_of_ownership = list_at(outputs, output_key_index)

      let Output { value: proof_of_ownership_value, .. } = proof_of_ownership

      let user_locked_tuna =
        quantity_of(out_nft_value, fortuna_v1_hash, fortuna.token_name) - quantity_of(
          nft_value,
          fortuna_v1_hash,
          fortuna.token_name,
        )

      and {
        // Miner mined a valid fortuna v1 block
        quantity_of(
          fortuna_v1_value,
          fortuna_v1_hash,
          fortuna.master_token_name,
        ) == 1,
        // Proves that the user owns the nft key
        quantity_of(proof_of_ownership_value, own_policy, nft_key) == 1,
        // nft key at output datum has same token name as minted nft key
        out_nft_key == nft_key,
        // Miner locked at least some tuna
        user_locked_tuna > 0,
        // Miner lock state is updated correctly
        out_locked_tuna == user_locked_tuna + locked_tuna,
        check_block_signal(
          block_number,
          fork_block_height,
          block_signals,
          out_block_signals,
        ),
        // Miner lock value is correct
        value.without_lovelace(out_miner_lock_value) == value.without_lovelace(
          miner_lock_value,
        ),
        quantity_of(out_miner_lock_value, own_policy, miner_lock_state_token) == 1,
      }
    }

    LockInit -> {
      // Use blake hash since it's faster and this is unrelated to Proof of Work
      let own_token_name =
        builtin.head_list(inputs).output_reference
          |> builtin.serialise_data
          |> blake2b_256

      // validate mint
      // Expect only 1 minted token, we validate the output to check token name
      expect [(minted_token, 1)] =
        mint
          |> value.from_minted_value
          |> value.tokens(own_policy)
          |> dict.to_list

      // Handle getting input state
      expect [Input { output: lock_input, .. }] = script_inputs

      let Output { value: lock_value, datum: lock_datum, .. } = lock_input

      expect InlineDatum(lock_datum) = lock_datum

      expect LockState { locked_tuna }: ForkDatum = lock_datum

      // Handle getting output states
      let (out_lock_value, out_lock_datum, out_nft_value, nft_datum) =
        get_output_lock_state(
          outputs,
          lock_output_index,
          nft_output_index,
          own_address,
        )

      expect LockState { locked_tuna: out_locked_tuna }: ForkDatum =
        out_lock_datum

      expect NftState { nft_key }: ForkDatum = nft_datum

      let user_locked_tuna =
        quantity_of(out_nft_value, fortuna_v1_hash, fortuna.token_name)

      and {
        // nft key at output datum has same token name as minted nft key
        nft_key == own_token_name,
        minted_token == own_token_name,
        // User locked at least some tuna
        user_locked_tuna > 0,
        // User lock state is updated correctly
        out_locked_tuna == user_locked_tuna + locked_tuna,
        // User lock value is correct
        value.without_lovelace(out_lock_value) == value.without_lovelace(
          lock_value,
        ),
        quantity_of(out_lock_value, own_policy, lock_state_token) == 1,
      }
    }

    LockMore { nft_input_ref, output_key_index } -> {
      // validate mint
      expect [] =
        mint
          |> value.from_minted_value
          |> value.tokens(own_policy)
          |> dict.to_list

      // Handle getting input state
      expect [script_input1, script_input2] = script_inputs

      let (lock_input, nft_input) =
        if script_input1.output_reference == nft_input_ref {
          (script_input2.output, script_input1.output)
        } else {
          (script_input1.output, script_input2.output)
        }

      let Output { value: lock_value, datum: lock_datum, .. } = lock_input

      expect InlineDatum(lock_datum) = lock_datum

      expect LockState { locked_tuna }: ForkDatum = lock_datum

      let Output { value: nft_value, datum: nft_datum, .. } = nft_input

      expect InlineDatum(nft_datum) = nft_datum

      expect NftState { nft_key }: ForkDatum = nft_datum

      // Handle getting output states
      let (out_lock_value, out_lock_datum, out_nft_value, nft_datum) =
        get_output_lock_state(
          outputs,
          lock_output_index,
          nft_output_index,
          own_address,
        )

      expect LockState { locked_tuna: out_locked_tuna }: ForkDatum =
        out_lock_datum

      expect NftState { nft_key: out_nft_key }: ForkDatum = nft_datum

      let proof_of_ownership = list_at(outputs, output_key_index)

      let Output { value: proof_of_ownership_value, .. } = proof_of_ownership

      let user_locked_tuna =
        quantity_of(out_nft_value, fortuna_v1_hash, fortuna.token_name) - quantity_of(
          nft_value,
          fortuna_v1_hash,
          fortuna.token_name,
        )

      and {
        // Proves that the user owns the nft key
        quantity_of(proof_of_ownership_value, own_policy, nft_key) == 1,
        // nft key at output datum has same token name as minted nft key
        out_nft_key == nft_key,
        // User locked at least some tuna
        user_locked_tuna > 0,
        // User lock state is updated correctly
        out_locked_tuna == user_locked_tuna + locked_tuna,
        // User lock value is correct
        value.without_lovelace(out_lock_value) == value.without_lovelace(
          lock_value,
        ),
        quantity_of(out_lock_value, own_policy, lock_state_token) == 1,
      }
    }
  }
}

pub fn lock_after_fork(
  fortuna_v1_hash: ByteArray,
  lock_output_index: Int,
  nft_output_index: Int,
  lock_action: LockAction,
  transaction: Transaction,
  own_policy: ByteArray,
  total_emission_at_fork: Int,
  miner_locked_tuna: Int,
) -> Bool {
  let Transaction { inputs, outputs, mint, .. } = transaction

  let own_address =
    Address {
      payment_credential: ScriptCredential(own_policy),
      stake_credential: None,
    }

  let script_inputs =
    list.filter(inputs, fn(input) { input.output.address == own_address })

  when lock_action is {
    LockInit -> {
      // Use blake hash since it's faster and this is unrelated to Proof of Work
      let own_token_name =
        builtin.head_list(inputs).output_reference
          |> builtin.serialise_data
          |> blake2b_256

      // validate mint
      // Expect only 1 minted token, we validate the output to check token name
      expect [(minted_token, 1)] =
        mint
          |> value.from_minted_value
          |> value.tokens(own_policy)
          |> dict.to_list

      // Handle getting input state
      expect [Input { output: lock_input, .. }] = script_inputs

      let Output { value: lock_value, datum: lock_datum, .. } = lock_input

      expect InlineDatum(lock_datum) = lock_datum

      expect LockState { locked_tuna }: ForkDatum = lock_datum

      // Handle getting output states
      let (out_lock_value, out_lock_datum, out_nft_value, nft_datum) =
        get_output_lock_state(
          outputs,
          lock_output_index,
          nft_output_index,
          own_address,
        )

      expect LockState { locked_tuna: out_locked_tuna }: ForkDatum =
        out_lock_datum

      expect NftState { nft_key }: ForkDatum = nft_datum

      let user_locked_tuna =
        quantity_of(out_nft_value, fortuna_v1_hash, fortuna.token_name)

      and {
        // nft key at output datum has same token name as minted nft key
        nft_key == own_token_name,
        minted_token == own_token_name,
        // User locked at least some tuna
        user_locked_tuna > 0,
        // User lock state is updated correctly
        out_locked_tuna == user_locked_tuna + locked_tuna,
        out_locked_tuna + miner_locked_tuna <= total_emission_at_fork,
        // User lock value is correct
        value.without_lovelace(out_lock_value) == value.without_lovelace(
          lock_value,
        ),
        quantity_of(out_lock_value, own_policy, lock_state_token) == 1,
      }
    }

    LockMore { nft_input_ref, output_key_index } -> {
      // validate mint
      expect [] =
        mint
          |> value.from_minted_value
          |> value.tokens(own_policy)
          |> dict.to_list

      // Handle getting input state
      expect [script_input1, script_input2] = script_inputs

      let (lock_input, nft_input) =
        if script_input1.output_reference == nft_input_ref {
          (script_input2.output, script_input1.output)
        } else {
          (script_input1.output, script_input2.output)
        }

      let Output { value: lock_value, datum: lock_datum, .. } = lock_input

      expect InlineDatum(lock_datum) = lock_datum

      expect LockState { locked_tuna }: ForkDatum = lock_datum

      let Output { value: nft_value, datum: nft_datum, .. } = nft_input

      expect InlineDatum(nft_datum) = nft_datum

      expect NftState { nft_key }: ForkDatum = nft_datum

      // Handle getting output states
      let (out_lock_value, out_lock_datum, out_nft_value, nft_datum) =
        get_output_lock_state(
          outputs,
          lock_output_index,
          nft_output_index,
          own_address,
        )

      expect LockState { locked_tuna: out_locked_tuna }: ForkDatum =
        out_lock_datum

      expect NftState { nft_key: out_nft_key }: ForkDatum = nft_datum

      let proof_of_ownership = list_at(outputs, output_key_index)

      let Output { value: proof_of_ownership_value, .. } = proof_of_ownership

      let user_locked_tuna =
        quantity_of(out_nft_value, fortuna_v1_hash, fortuna.token_name) - quantity_of(
          nft_value,
          fortuna_v1_hash,
          fortuna.token_name,
        )

      and {
        // Proves that the user owns the nft key
        quantity_of(proof_of_ownership_value, own_policy, nft_key) == 1,
        // nft key at output datum has same token name as minted nft key
        out_nft_key == nft_key,
        // User locked at least some tuna
        user_locked_tuna > 0,
        // User lock state is updated correctly
        out_locked_tuna == user_locked_tuna + locked_tuna,
        out_locked_tuna + miner_locked_tuna <= total_emission_at_fork,
        // User lock value is correct
        value.without_lovelace(out_lock_value) == value.without_lovelace(
          lock_value,
        ),
        quantity_of(out_lock_value, own_policy, lock_state_token) == 1,
      }
    }

    _ -> False
  }
}

pub fn unlock_failed_fork(
  transaction: Transaction,
  own_policy: ByteArray,
  hard_fork_state_ref: OutputReference,
) -> Bool {
  let Transaction { inputs, reference_inputs, mint, .. } = transaction

  let own_address =
    Address {
      payment_credential: ScriptCredential(own_policy),
      stake_credential: None,
    }

  let script_inputs =
    list.filter(inputs, fn(input) { input.output.address == own_address })

  let mint = value.from_minted_value(mint)

  let hfs_input =
    utils.resolve_output_reference(reference_inputs, hard_fork_state_ref)

  // Can only unlock one input at a time 
  expect [Input { output: locked_v1_input, .. }] = script_inputs

  let Output { datum: hfs_datum, value: hfs_value, .. } = hfs_input

  expect InlineDatum(hfs_datum) = hfs_datum
  expect HardForkState { status: FailedFork, .. }: ForkDatum = hfs_datum

  let Output { datum: nft_state, .. } = locked_v1_input

  expect InlineDatum(nft_state) = nft_state

  expect NftState { nft_key }: ForkDatum = nft_state

  expect [(token_name, -1)] = mint |> tokens(own_policy) |> dict.to_list

  and {
    quantity_of(hfs_value, own_policy, hard_fork_state_token) == 1,
    token_name == nft_key,
  }
}

pub fn burn_forked(
  transaction: Transaction,
  own_policy: ByteArray,
  hard_fork_state_ref: OutputReference,
  locked_tokens_ref: OutputReference,
) -> Bool {
  let Transaction { inputs, reference_inputs, mint, .. } = transaction

  let own_address =
    Address {
      payment_credential: ScriptCredential(own_policy),
      stake_credential: None,
    }

  let script_inputs =
    list.filter(inputs, fn(input) { input.output.address == own_address })

  let mint = value.from_minted_value(mint)

  let hfs_input =
    utils.resolve_output_reference(reference_inputs, hard_fork_state_ref)

  // Can only not unlock any inputs
  expect [] = script_inputs

  let locked_v1_input =
    utils.resolve_output_reference(reference_inputs, locked_tokens_ref)

  let Output { datum: hfs_datum, value: hfs_value, .. } = hfs_input

  expect InlineDatum(hfs_datum) = hfs_datum
  //
  expect HardForkState { status: Forked, .. }: ForkDatum = hfs_datum

  let Output { datum: nft_state, .. } = locked_v1_input

  expect InlineDatum(nft_state) = nft_state

  expect NftState { nft_key }: ForkDatum = nft_state

  expect [(token_name, -1)] = mint |> tokens(own_policy) |> dict.to_list

  and {
    quantity_of(hfs_value, own_policy, hard_fork_state_token) == 1,
    token_name == nft_key,
  }
}

pub fn hard_fork(
  fortuna_v1_hash: ByteArray,
  hard_fork_state_input: OutputReference,
  lock_output_index: Int,
  nft_output_index: Int,
  hardfork_output_index: Int,
  lock_action: LockAction,
  v2_miner_output: Int,
  transaction: Transaction,
  own_policy: ByteArray,
  ref_locked_tuna: Int,
) -> Bool {
  let Transaction { inputs, outputs, mint, .. } = transaction

  let own_address =
    Address {
      payment_credential: ScriptCredential(own_policy),
      stake_credential: None,
    }

  let script_inputs =
    list.filter(inputs, fn(input) { input.output.address == own_address })

  when lock_action is {
    MinerLockInit { fortuna_v1_output } -> {
      // Use blake hash since it's faster and this is unrelated to Proof of Work
      let own_token_name =
        builtin.head_list(inputs).output_reference
          |> builtin.serialise_data
          |> blake2b_256

      // validate mint
      // Expect only 1 minted token, we validate the output to check token name
      expect [(minted_token, 1)] =
        mint
          |> value.from_minted_value
          |> value.tokens(own_policy)
          |> dict.to_list

      // Handle getting input state
      expect [script_input1, script_input2] = script_inputs

      let (hard_fork_state_input, miner_lock_input) =
        if script_input1.output_reference == hard_fork_state_input {
          (script_input1.output, script_input2.output)
        } else {
          (script_input2.output, script_input1.output)
        }

      let Output { value: miner_lock_value, datum: miner_lock_datum, .. } =
        miner_lock_input

      expect InlineDatum(miner_lock_datum) = miner_lock_datum

      expect MinerLockState { locked_tuna, block_signals }: ForkDatum =
        miner_lock_datum

      let Output {
        value: hard_fork_state_value,
        datum: hard_fork_state_datum,
        ..
      } = hard_fork_state_input

      expect InlineDatum(hard_fork_state_datum) = hard_fork_state_datum

      expect HardForkState {
        status: NotForked,
        fork_block_height,
        fortuna_next_validator_hash,
      }: ForkDatum = hard_fork_state_datum

      let total_emitted = calculate_emission(fork_block_height)

      // Handle getting output states
      let fortuna_v1_output = list_at(outputs, fortuna_v1_output)

      let Output { value: fortuna_v1_value, datum: fortuna_v1_datum, .. } =
        fortuna_v1_output

      expect InlineDatum(fortuna_v1_datum) = fortuna_v1_datum

      expect State { block_number, .. }: State = fortuna_v1_datum

      let (out_miner_lock_value, out_miner_lock_datum, out_nft_value, nft_datum) =
        get_output_lock_state(
          outputs,
          lock_output_index,
          nft_output_index,
          own_address,
        )

      expect MinerLockState {
        locked_tuna: out_locked_tuna,
        block_signals: out_block_signals,
      }: ForkDatum = out_miner_lock_datum

      expect NftState { nft_key }: ForkDatum = nft_datum

      let hfs_output = list_at(outputs, hardfork_output_index)

      let Output { address, value: out_hfs_value, datum: out_hfs_datum, .. } =
        hfs_output

      expect address == own_address
      //
      expect InlineDatum(out_hfs_datum) = out_hfs_datum

      expect HardForkState {
        status: Forked,
        fork_block_height: out_fork_block_height,
        fortuna_next_validator_hash: out_fortuna_next_validator_hash,
      }: ForkDatum = out_hfs_datum

      let fortuna_v2 = list_at(outputs, v2_miner_output)

      let Output {
        address,
        value: fortuna_v2_value,
        datum: fortuna_v2_datum,
        ..
      } = fortuna_v2

      expect
        address == Address {
          payment_credential: ScriptCredential(fortuna_next_validator_hash),
          stake_credential: None,
        }
      expect InlineDatum(fortuna_v2_datum) = fortuna_v2_datum

      let user_locked_tuna =
        quantity_of(out_nft_value, fortuna_v1_hash, fortuna.token_name)

      and {
        // Miner mined a valid fortuna v1 block
        quantity_of(
          fortuna_v1_value,
          fortuna_v1_hash,
          fortuna.master_token_name,
        ) == 1,
        // Hard fork state is run at correct block number
        fork_block_height == block_number,
        // Fortuna v2 Output state is correct
        fortuna_v2_datum == fortuna_v1_datum,
        // Fortuna v2 Output value is correct
        utils.value_has_nft_and_lovelace(
          fortuna_v2_value,
          fortuna_next_validator_hash,
          fortuna.master_token_name,
        ),
        // nft key at output datum has same token name as minted nft key
        nft_key == own_token_name,
        minted_token == own_token_name,
        // Miner locked at least some tuna
        user_locked_tuna > 0,
        // Miner lock state is updated correctly
        out_locked_tuna == user_locked_tuna + locked_tuna,
        out_block_signals == block_signals + 1,
        // Thresholds are met
        out_block_signals >= miner_hardfork_threshold,
        out_locked_tuna + ref_locked_tuna >= total_emitted * tuna_hardfork_threshold_numerator / tuna_hardfork_threshold_denominator,
        // Miner lock value is correct
        value.without_lovelace(out_miner_lock_value) == value.without_lovelace(
          miner_lock_value,
        ),
        quantity_of(out_miner_lock_value, own_policy, miner_lock_state_token) == 1,
        // Hard fork state is updated correctly
        out_fork_block_height == fork_block_height,
        out_fortuna_next_validator_hash == fortuna_next_validator_hash,
        // Hard fork state value is correct
        quantity_of(hard_fork_state_value, own_policy, hard_fork_state_token) == 1,
        utils.value_has_nft_and_lovelace(
          out_hfs_value,
          own_policy,
          hard_fork_state_token,
        ),
      }
    }

    MinerLockMore { fortuna_v1_output, nft_input_ref, output_key_index } -> {
      expect [] =
        mint
          |> value.from_minted_value
          |> value.tokens(own_policy)
          |> dict.to_list

      // Handle getting input state
      expect [script_input1, script_input2, script_input3] = script_inputs

      let (hard_fork_state_input, miner_lock_input, nft_input) =
        if script_input1.output_reference == hard_fork_state_input {
          if script_input2.output_reference == nft_input_ref {
            (script_input1.output, script_input3.output, script_input2.output)
          } else {
            (script_input1.output, script_input2.output, script_input3.output)
          }
        } else if script_input2.output_reference == hard_fork_state_input {
          if script_input1.output_reference == nft_input_ref {
            (script_input2.output, script_input3.output, script_input1.output)
          } else {
            (script_input2.output, script_input1.output, script_input3.output)
          }
        } else {
          if script_input1.output_reference == nft_input_ref {
            (script_input3.output, script_input2.output, script_input1.output)
          } else {
            (script_input3.output, script_input1.output, script_input2.output)
          }
        }

      let Output { value: miner_lock_value, datum: miner_lock_datum, .. } =
        miner_lock_input

      expect InlineDatum(miner_lock_datum) = miner_lock_datum

      expect MinerLockState { locked_tuna, block_signals }: ForkDatum =
        miner_lock_datum

      let Output { value: nft_value, datum: nft_datum, .. } = nft_input

      expect InlineDatum(nft_datum) = nft_datum

      expect NftState { nft_key }: ForkDatum = nft_datum

      let Output {
        value: hard_fork_state_value,
        datum: hard_fork_state_datum,
        ..
      } = hard_fork_state_input

      expect InlineDatum(hard_fork_state_datum) = hard_fork_state_datum

      expect HardForkState {
        status: NotForked,
        fork_block_height,
        fortuna_next_validator_hash,
      }: ForkDatum = hard_fork_state_datum

      let total_emitted = calculate_emission(fork_block_height)

      // Handle getting output states
      let fortuna_v1_output = list_at(outputs, fortuna_v1_output)

      let Output { value: fortuna_v1_value, datum: fortuna_v1_datum, .. } =
        fortuna_v1_output

      expect InlineDatum(fortuna_v1_datum) = fortuna_v1_datum

      expect State { block_number, .. }: State = fortuna_v1_datum

      let (out_miner_lock_value, out_miner_lock_datum, out_nft_value, nft_datum) =
        get_output_lock_state(
          outputs,
          lock_output_index,
          nft_output_index,
          own_address,
        )

      expect MinerLockState {
        locked_tuna: out_locked_tuna,
        block_signals: out_block_signals,
      }: ForkDatum = out_miner_lock_datum

      expect NftState { nft_key: out_nft_key }: ForkDatum = nft_datum

      let hfs_output = list_at(outputs, hardfork_output_index)

      let Output { address, value: out_hfs_value, datum: out_hfs_datum, .. } =
        hfs_output

      expect address == own_address
      //
      expect InlineDatum(out_hfs_datum) = out_hfs_datum

      expect HardForkState {
        status: Forked,
        fork_block_height: out_fork_block_height,
        fortuna_next_validator_hash: out_fortuna_v2_hash,
      }: ForkDatum = out_hfs_datum

      let fortuna_v2 = list_at(outputs, v2_miner_output)

      let Output {
        address,
        value: fortuna_v2_value,
        datum: fortuna_v2_datum,
        ..
      } = fortuna_v2

      expect
        address == Address {
          payment_credential: ScriptCredential(fortuna_next_validator_hash),
          stake_credential: None,
        }
      expect InlineDatum(fortuna_v2_datum) = fortuna_v2_datum

      let user_locked_tuna =
        quantity_of(out_nft_value, fortuna_v1_hash, fortuna.token_name) - quantity_of(
          nft_value,
          fortuna_v1_hash,
          fortuna.token_name,
        )

      let proof_of_ownership = list_at(outputs, output_key_index)

      let Output { value: proof_of_ownership_value, .. } = proof_of_ownership

      and {
        // Miner mined a valid fortuna v1 block
        quantity_of(
          fortuna_v1_value,
          fortuna_v1_hash,
          fortuna.master_token_name,
        ) == 1,
        // Hard fork state is run at correct block number
        fork_block_height == block_number,
        // Fortuna v2 Output state is correct
        fortuna_v2_datum == fortuna_v1_datum,
        // Fortuna v2 Output value is correct
        utils.value_has_nft_and_lovelace(
          fortuna_v2_value,
          fortuna_next_validator_hash,
          fortuna.master_token_name,
        ),
        // nft key at output datum has same token name as nft key
        nft_key == out_nft_key,
        quantity_of(proof_of_ownership_value, own_policy, nft_key) == 1,
        // Miner locked at least some tuna
        user_locked_tuna > 0,
        // Miner lock state is updated correctly
        out_locked_tuna == user_locked_tuna + locked_tuna,
        out_block_signals == block_signals + 1,
        // Thresholds are met
        out_block_signals >= miner_hardfork_threshold,
        out_locked_tuna + ref_locked_tuna >= total_emitted * tuna_hardfork_threshold_numerator / tuna_hardfork_threshold_denominator,
        // Miner lock value is correct
        value.without_lovelace(out_miner_lock_value) == value.without_lovelace(
          miner_lock_value,
        ),
        quantity_of(out_miner_lock_value, own_policy, miner_lock_state_token) == 1,
        // Hard fork state is updated correctly
        out_fork_block_height == fork_block_height,
        out_fortuna_v2_hash == fortuna_next_validator_hash,
        // Hard fork state value is correct
        quantity_of(hard_fork_state_value, own_policy, hard_fork_state_token) == 1,
        utils.value_has_nft_and_lovelace(
          out_hfs_value,
          own_policy,
          hard_fork_state_token,
        ),
      }
    }

    _ -> False
  }
}

pub fn calculate_emission(block_height: Int) -> Int {
  if block_height < halving_number {
    block_height * initial_payout
  } else {
    halving_number * initial_payout + do_calculate_emission(
      block_height - halving_number,
      1,
    )
  }
}

fn do_calculate_emission(block_height: Int, halving_epoch: Int) -> Int {
  if block_height < halving_number {
    block_height * initial_payout / math.pow2(halving_epoch)
  } else {
    halving_number * initial_payout / math.pow2(halving_epoch) + do_calculate_emission(
      block_height - halving_number,
      halving_epoch + 1,
    )
  }
}

test calculate_emission_1() {
  calculate_emission(3000) == 15000000000000
}

test calculate_emission_2() {
  calculate_emission(210000) == 1050000000000000
}

test calculate_emission_3() {
  calculate_emission(210001) == 1050002500000000
}

pub fn get_output_lock_state(
  outputs: List<Output>,
  lock_output_index: Int,
  nft_output_index: Int,
  own_address: Address,
) -> (Value, Data, Value, Data) {
  let miner_lock_output = list_at(outputs, lock_output_index)

  let Output {
    address,
    value: out_miner_lock_value,
    datum: out_miner_lock_datum,
    ..
  } = miner_lock_output

  expect address == own_address
  //
  expect InlineDatum(out_miner_lock_datum) = out_miner_lock_datum

  let nft_output = list_at(outputs, nft_output_index)

  let Output { address, value: out_nft_value, datum: nft_datum, .. } =
    nft_output

  expect address == own_address
  //
  expect InlineDatum(nft_datum) = nft_datum

  (out_miner_lock_value, out_miner_lock_datum, out_nft_value, nft_datum)
}

pub fn get_hardfork_state(
  inputs: List<Input>,
  output_ref: OutputReference,
  own_policy: ByteArray,
) -> ForkDatum {
  let hard_fork_state_input = utils.resolve_output_reference(inputs, output_ref)

  expect
    quantity_of(hard_fork_state_input.value, own_policy, hard_fork_state_token) == 1
  //
  expect InlineDatum(hard_fork_state_datum) = hard_fork_state_input.datum

  expect HardForkState { .. } as datum: ForkDatum = hard_fork_state_datum
  datum
}

pub fn check_block_signal(
  block_height,
  fork_block_height,
  block_signals,
  out_block_signals,
) -> Bool {
  if block_height >= fork_block_height - tuna_count_blocks_from {
    out_block_signals == block_signals + 1
  } else {
    out_block_signals == block_signals
  }
}

test check_block_signal_1() {
  check_block_signal(0, 1000, 0, 1)
}

test check_block_signal_2() {
  check_block_signal(0, 1001, 0, 0)
}

test check_block_signal_3() {
  check_block_signal(1, 1000, 0, 1)
}

test check_block_signal_4() {
  check_block_signal(1000, 1000, 0, 1)
}

test check_block_signal_5() {
  check_block_signal(0, 1000, 10, 11)
}
