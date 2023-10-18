use aiken/builtin
use aiken/dict
use aiken/hash.{blake2b_256, sha2_256}
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/list
use aiken/math
use aiken/transaction.{
  InlineDatum, Mint, Output, OutputReference, ScriptContext, Spend, Transaction,
} as tx
use aiken/transaction/credential.{Address, Inline, ScriptCredential}
use aiken/transaction/value.{tokens}
use fortuna
use fortuna/parameters.{epoch_number, halving_number, initial_payout}
use fortuna/types.{State}
use fortuna/utils.{list_at, quantity_of}
use hardfork
use hardfork/hftypes.{
  ForkDatum, Forked, HardForkState, LockAction, LockState, MinerLockState,
  NftState, NotForked,
}

type TunaAction {
  Genesis
  Mine
  Redeem(OutputReference)
}

type Miner {
  Pkh(ByteArray)
  Nft { policy: ByteArray, name: ByteArray, output_index: Int }
}

type MineAction {
  nonce: ByteArray,
  miner: Miner,
}

type TargetState {
  nonce: ByteArray,
  epoch_time: Int,
  block_number: Int,
  current_hash: ByteArray,
  leading_zeros: Int,
  target_number: Int,
  miner: ByteArray,
}

validator(
  init_utxo_ref: OutputReference,
  fork_hash: ByteArray,
  fortuna_v1_hash: ByteArray,
) {
  fn tuna(redeemer: TunaAction, ctx: ScriptContext) -> Bool {
    expect ScriptContext { transaction: tx, purpose: Mint(own_policy) } = ctx

    when redeemer is {
      Genesis -> {
        // This time genesis mints "lord tuna" and hands it over to the hard fork contract
        // Then after the hard fork, "lord tuna" is handed back over to this miner contract
        // This allows us to maintain the miner contract with the same logic as the old one
        let Transaction { inputs, outputs, mint, .. } = tx

        // To simplify the logic, we expect the first output to hold the hard fork state
        let output = list_at(outputs, 0)

        let Output { address: out_address, value: out_value, .. } = output

        let mint = value.from_minted_value(mint)

        // The reason we check minted amount but not token name 
        // is because we check the token name and presence in the output to the hard fork script
        // Plus this action can only be run once in the lifetime of this script
        expect [(_, 1)] = mint |> tokens(own_policy) |> dict.to_list

        let genesis_input =
          utils.resolve_output_reference(inputs, init_utxo_ref)

        and {
          out_address == Address {
            payment_credential: ScriptCredential(fork_hash),
            stake_credential: None,
          },
          quantity_of(out_value, fork_hash, hardfork.hard_fork_state_token) == 1,
          quantity_of(out_value, own_policy, fortuna.master_token_name) == 1,
          genesis_input == genesis_input,
        }
      }

      Mine -> {
        let own_credential = ScriptCredential(own_policy)
        let own_address =
          Address { payment_credential: own_credential, stake_credential: None }

        // Mint(0) Mine requirement: Contract has one spend input with the policy as the payment credential
        list.any(tx.inputs, fn(input) { input.output.address == own_address })?
      }
      Redeem(locked_tokens_ref) -> {
        let Transaction { reference_inputs, mint, .. } = tx

        let mint = value.from_minted_value(mint)

        let own_input =
          utils.resolve_output_reference(reference_inputs, locked_tokens_ref)

        let Output { address: in_address, value: in_value, datum: in_datum, .. } =
          own_input

        let locked_tokens =
          quantity_of(in_value, fortuna_v1_hash, fortuna.token_name)

        expect InlineDatum(datum) = in_datum

        expect NftState { nft_key }: ForkDatum = datum

        expect [(token_name, quantity)] =
          mint |> tokens(own_policy) |> dict.to_list

        and {
          quantity_of(mint, fork_hash, nft_key) == -1,
          token_name == fortuna.token_name,
          quantity == locked_tokens,
          in_address == Address {
            payment_credential: ScriptCredential(fork_hash),
            stake_credential: None,
          },
        }
      }
    }
  }

  fn mine(datum: State, redeemer: MineAction, ctx: ScriptContext) -> Bool {
    // Access transaction information
    let State {
      block_number,
      current_hash,
      leading_zeros,
      target_number,
      epoch_time,
      current_posix_time,
      interlink,
      ..
    } = datum

    let ScriptContext { transaction, purpose } = ctx

    expect Spend(own_reference) = purpose

    let Transaction { inputs, outputs, mint, validity_range, .. } = transaction

    let mint = value.from_minted_value(mint)

    let own_input = fortuna.own_validator_input_utxo(inputs, own_reference)

    let Output { address: in_address, value: in_value, .. } = own_input

    let credential = in_address.payment_credential

    expect ScriptCredential(own_validator_hash) = credential

    let MineAction { nonce, miner } = redeemer

    // Spend(0) requirement: Contract has only one output with the master token going back to itself
    expect Some(own_output) =
      list.find(outputs, fn(output: Output) { output.address == in_address })

    let Output { datum: out_datum, value: out_value, .. } = own_output

    // Time Range Span is 3 minutes or less 
    let Interval {
      upper_bound: IntervalBound {
        bound_type: upper_range,
        is_inclusive: upper_is_inclusive,
      },
      lower_bound: IntervalBound {
        bound_type: lower_range,
        is_inclusive: lower_is_inclusive,
      },
    } = validity_range

    // We have a constant expectation of the transaction time range
    expect Finite(upper_range) = upper_range
    expect Finite(lower_range) = lower_range
    let averaged_current_time = ( upper_range - lower_range ) / 2 + lower_range

    // Posix time is in milliseconds
    // Spend(1) requirement: Time range span is 3 minutes or less and inclusive
    expect and {
        !upper_is_inclusive?,
        lower_is_inclusive?,
        (upper_range - lower_range <= 180000)?,
      }
    //
    // In case you are wondering here is what enables pools
    // A miner can be a pkh or an nft
    // Nfts can come from any input, even validators
    // So any validator logic can be enforced to run along with fortuna
    expect
      when miner is {
        Pkh(signer) -> list.has(transaction.extra_signatories, signer)
        Nft { policy: nft_policy, name: nft_name, output_index } -> {
          //
          let quantity =
            utils.list_at(outputs, output_index).value
              |> quantity_of(nft_policy, nft_name)
          //
          // Spend(2) requirement: Output has nft
          quantity == 1
        }
      }
    //
    // Target state now includes a miner credential
    let target =
      TargetState {
        nonce,
        epoch_time,
        block_number,
        current_hash,
        leading_zeros,
        target_number,
        miner: blake2b_256(builtin.serialise_data(miner)),
      }

    let found_bytearray =
      target
        |> builtin.serialise_data()
        |> sha2_256()
        |> sha2_256()

    let (found_target_number, found_leading_zeros) =
      fortuna.format_found_bytearray(found_bytearray)

    // Mining Difficulty Met
    // Spend(2) requirement: Found difficulty is less than or equal to the current difficulty
    // We do this by checking the leading zeros and the difficulty number
    expect or {
        (found_leading_zeros > leading_zeros)?,
        and {
          (found_leading_zeros == leading_zeros)?,
          (found_target_number < target_number)?,
        },
      }
    //
    // Spend(3) requirement: Input has master token
    expect
      (quantity_of(in_value, own_validator_hash, fortuna.master_token_name) == 1)?
    //
    // Spend(4) requirement: Only one type of token minted under the validator policy
    expect [(token_name, quantity)] =
      mint
        |> tokens(own_validator_hash)
        |> dict.to_list

    let halving_exponent = block_number / halving_number

    let expected_quantity =
      if halving_exponent > 29 {
        0
      } else {
        initial_payout / math.pow2(halving_exponent)
      }

    // Spend(5) requirement: Minted token is the correct name and amount
    expect and {
        (token_name == fortuna.token_name)?,
        (quantity == expected_quantity)?,
      }
    //
    // Spend(6) requirement: Output has only master token and ada
    expect
      fortuna.value_has_only_master_and_lovelace(out_value, own_validator_hash)?
    // Check output datum contains correct epoch time, block number, hash, and leading zeros
    // Check for every divisible by 2016 block: 
    // - Epoch time resets
    // - leading zeros is adjusted based on percent of hardcoded target time for 2016 blocks vs epoch time
    expect InlineDatum(output_datum) = out_datum
    // Spend(7) requirement: Expect Output Datum to be of type State
    expect State {
      block_number: out_block_number,
      current_hash: out_current_hash,
      leading_zeros: out_leading_zeros,
      target_number: out_target_number,
      epoch_time: out_epoch_time,
      current_posix_time: out_current_posix_time,
      interlink: out_interlink,
      extra,
    }: State = output_datum

    // Spend(8) requirement: Check output has correct difficulty number, leading zeros, and epoch time
    expect
      if block_number % epoch_number == 0 && block_number > 0 {
        // use total epoch time with target epoch time to get difficulty adjustment ratio
        // ratio maxes out at 4/1 and mins to 1/4
        let total_epoch_time =
          epoch_time + averaged_current_time - current_posix_time
        let (adjustment_numerator, adjustment_denominator) =
          fortuna.get_difficulty_adjustment(total_epoch_time)
        // Now use ratio to find new leading zeros difficulty
        let (new_difficulty, new_leading_zeroes) =
          fortuna.get_new_difficulty(
            target_number,
            leading_zeros,
            adjustment_numerator,
            adjustment_denominator,
          )
        //
        and {
          (new_leading_zeroes == out_leading_zeros)?,
          (new_difficulty == out_target_number)?,
          (0 == out_epoch_time)?,
        }
      } else {
        let new_epoch_time =
          epoch_time + averaged_current_time - current_posix_time
        // 
        and {
          (leading_zeros == out_leading_zeros)?,
          (target_number == out_target_number)?,
          (new_epoch_time == out_epoch_time)?,
        }
      }
    //
    and {
      // Spend(9) requirement: Output posix time is the averaged current time
      (out_current_posix_time == averaged_current_time)?,
      // Spend(10) requirement: Output block number is the input block number + 1 
      (block_number + 1 == out_block_number)?,
      // Spend(11) requirement: Output current hash is the target hash
      (out_current_hash == found_bytearray)?,
      //Spend(12) requirement: Check output extra field is within a certain size
      (builtin.length_of_bytearray(builtin.serialise_data(extra)) <= 512)?,
      // Spend(13) requirement: Check output interlink is correct
      (fortuna.calculate_interlink(
        interlink,
        found_bytearray,
        found_leading_zeros,
        found_target_number,
        target_number,
        leading_zeros,
      ) == out_interlink)?,
    }
  }
}

type NftForkAction {
  Initialize

  Lock {
    hard_fork_state_ref: OutputReference,
    lock_output_index: Int,
    nft_output_index: Int,
    lock_action: LockAction,
  }

  HardFork {
    hard_fork_state_input: OutputReference,
    v2_miner_output: Int,
    lock_output_index: Int,
    nft_output_index: Int,
    hardfork_output_index: Int,
    lock_action: LockAction,
  }

  Unlock { hard_fork_state_ref: OutputReference }

  Burn {
    hard_fork_state_ref: OutputReference,
    locked_tokens_ref: OutputReference,
  }
}

// maybe we should do time instead of block height?
validator(init_utxo_ref: OutputReference, fortuna_v1_hash: ByteArray) {
  fn nft_fork(redeemer: Data, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, purpose } = ctx

    when purpose is {
      tx.Mint(own_policy) -> {
        let Transaction { withdrawals, .. } = transaction

        let own_withdrawal = Inline(ScriptCredential(own_policy))

        // Fork Mint(0) requirement: Withdrawal script is present
        dict.has_key(withdrawals, own_withdrawal)
      }

      tx.WithdrawFrom(stake_cred) -> {
        expect action: NftForkAction = redeemer

        expect Inline(ScriptCredential(own_policy)) = stake_cred

        when action is {
          // Check if the input is spent and proper initial state is made
          // No need to check spends from own script hash in intialize
          // The reason being is no meaningful locks can happen before initialize
          Initialize ->
            hardfork.initialize(init_utxo_ref, transaction, own_policy)

          Lock {
            hard_fork_state_ref,
            lock_output_index,
            nft_output_index,
            lock_action,
          } -> {
            expect HardForkState { status, fork_block_height, .. } =
              hardfork.get_hardfork_state(
                transaction.reference_inputs,
                hard_fork_state_ref,
                own_policy,
              )

            when status is {
              NotForked ->
                hardfork.lock_not_forked(
                  fortuna_v1_hash,
                  lock_output_index,
                  nft_output_index,
                  lock_action,
                  transaction,
                  own_policy,
                  fork_block_height,
                )
              Forked -> {
                let total_emission_at_fork =
                  hardfork.calculate_emission(fork_block_height)

                expect Some(miner_locked_state_output) =
                  list.find(
                    transaction.reference_inputs,
                    fn(input) {
                      quantity_of(
                        input.output.value,
                        own_policy,
                        hardfork.miner_lock_state_token,
                      ) == 1
                    },
                  )

                expect InlineDatum(miner_locked_state_datum) =
                  miner_locked_state_output.output.datum

                expect MinerLockState { locked_tuna: miner_locked_tuna, .. }: ForkDatum =
                  miner_locked_state_datum

                hardfork.lock_after_fork(
                  fortuna_v1_hash,
                  lock_output_index,
                  nft_output_index,
                  lock_action,
                  transaction,
                  own_policy,
                  total_emission_at_fork,
                  miner_locked_tuna,
                )
              }
              _ -> False
            }
          }

          // We allow unlocking of fortuna v1 tokens in the case of a failed fork
          // We only allow an input to be spent under the hard fork failed condition and when burning the nft key
          Unlock { hard_fork_state_ref } ->
            hardfork.unlock_failed_fork(
              transaction,
              own_policy,
              hard_fork_state_ref,
            )

          Burn { hard_fork_state_ref, locked_tokens_ref } ->
            hardfork.burn_forked(
              transaction,
              own_policy,
              hard_fork_state_ref,
              locked_tokens_ref,
            )

          HardFork {
            hard_fork_state_input,
            v2_miner_output,
            lock_output_index,
            nft_output_index,
            hardfork_output_index,
            lock_action,
          } -> {
            expect Some(miner_locked_state_output) =
              list.find(
                transaction.reference_inputs,
                fn(input) {
                  quantity_of(
                    input.output.value,
                    own_policy,
                    hardfork.lock_state_token,
                  ) == 1
                },
              )

            expect InlineDatum(miner_locked_state_datum) =
              miner_locked_state_output.output.datum

            expect LockState { locked_tuna }: ForkDatum =
              miner_locked_state_datum

            hardfork.hard_fork(
              fortuna_v1_hash,
              hard_fork_state_input,
              lock_output_index,
              nft_output_index,
              hardfork_output_index,
              lock_action,
              v2_miner_output,
              transaction,
              own_policy,
              locked_tuna,
            )
          }
        }
      }

      _ -> False
    }
  }

  fn fork(_datum, _redeemer, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, purpose } = ctx

    expect tx.Spend(own_ref) = purpose

    let Transaction { inputs, withdrawals, .. } = transaction

    let own_input = utils.resolve_output_reference(inputs, own_ref)

    let own_withdrawal = Inline(own_input.address.payment_credential)

    // Fork Spend(1) requirement: Withdrawal script is present
    dict.has_key(withdrawals, own_withdrawal)
  }
}
