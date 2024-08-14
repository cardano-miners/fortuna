use aiken/builtin
use aiken/dict
use aiken/hash.{sha2_256}
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/list
use aiken/math.{pow2}
use aiken/transaction.{
  InlineDatum, Mint, Output, OutputReference, ScriptContext, Spend, Transaction,
}
use aiken/transaction/credential.{ScriptCredential}
use aiken/transaction/value.{quantity_of, tokens}
use fortuna
use fortuna/parameters.{epoch_number, halving_number, initial_payout}
use fortuna/types.{State}
use fortuna/utils.{resolve_output_reference}

type TargetState {
  nonce: ByteArray,
  block_number: Int,
  current_hash: ByteArray,
  leading_zeros: Int,
  target_number: Int,
  epoch_time: Int,
}

type InputNonce =
  ByteArray

type MintingAction {
  Mine
  Genesis
}

validator(utxo_ref: OutputReference) {
  fn mint(state: MintingAction, ctx: ScriptContext) -> Bool {
    when state is {
      Genesis -> {
        expect ScriptContext { transaction: tx, purpose: Mint(own_policy) } =
          ctx

        let Transaction { inputs, outputs, mint, validity_range, .. } = tx

        let mint = value.from_minted_value(mint)

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

        expect Finite(upper_range) = upper_range

        expect Finite(lower_range) = lower_range

        // Posix time is in milliseconds
        // Mint(0) Genesis requirement: Time range span is 3 minutes or less and inclusive
        expect and {
            !upper_is_inclusive?,
            lower_is_inclusive?,
            (upper_range - lower_range <= 180000)?,
          }
        //
        let averaged_current_time =
          ( upper_range - lower_range ) / 2 + lower_range

        // Add in entropy from a reference output
        // Mint(1) Genesis requirement: Contract has initial entropy hash. No need for difficulty check
        expect
          list.any(inputs, fn(input) { input.output_reference == utxo_ref })?
        //
        let bootstrap_hash =
          utxo_ref
            |> builtin.serialise_data()
            |> sha2_256()
            |> sha2_256()

        // Mint(2) Genesis requirement: Expect one ouput with payment credential matching policy id
        expect [Output { datum: InlineDatum(output_datum), value, .. }] =
          list.filter(
            outputs,
            fn(output) {
              output.address.payment_credential == ScriptCredential(own_policy)
            },
          )

        // Mint(3) Genesis requirement: Mints master token
        expect fortuna.value_contains_master_token(mint, own_policy)?
        //
        // Mint(4) Genesis requirement: Master token goes to only script output
        expect fortuna.value_has_only_master_and_lovelace(value, own_policy)?
        //
        expect output_state: State = output_datum

        // Mint(5) Genesis requirement: Check initial datum state is set to default
        let initial_state =
          State {
            block_number: 0,
            current_hash: bootstrap_hash,
            leading_zeros: 5,
            target_number: 65535,
            epoch_time: 0,
            current_posix_time: averaged_current_time,
            extra: 0,
            interlink: [],
          }

        (initial_state == output_state)?
      }
      Mine -> {
        expect ScriptContext { transaction: tx, purpose: Mint(own_policy) } =
          ctx

        let own_credential = ScriptCredential(own_policy)

        // Mint(0) Mine requirement: Contract has one spend input with the policy as the payment credential
        list.any(
          tx.inputs,
          fn(input) {
            input.output.address.payment_credential == own_credential
          },
        )?
      }
    }
  }

  fn spend(state: State, nonce: InputNonce, ctx: ScriptContext) -> Bool {
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
    } = state

    let ScriptContext { transaction, purpose } = ctx

    expect Spend(own_reference) = purpose

    let Transaction { inputs, outputs, mint, validity_range, .. } = transaction

    let mint = value.from_minted_value(mint)

    let own_input = resolve_output_reference(inputs, own_reference)

    let Output { address: in_address, value: in_value, .. } = own_input

    let credential = in_address.payment_credential

    expect ScriptCredential(own_validator_hash) = credential

    // Spend(0) requirement: Contract has only one output going back to itself
    expect [own_output] =
      list.filter(outputs, fn(output: Output) { output.address == in_address })

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
    let target =
      TargetState {
        nonce,
        epoch_time,
        block_number,
        current_hash,
        leading_zeros,
        target_number,
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
    expect [Pair(token_name, quantity)] =
      mint
        |> tokens(own_validator_hash)
        |> dict.to_pairs

    let halving_exponent = block_number / halving_number

    let expected_quantity =
      if halving_exponent > 29 {
        0
      } else {
        initial_payout / pow2(halving_exponent)
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
      epoch_time: out_epoch_time,
      current_posix_time: out_current_posix_time,
      interlink: out_interlink,
      extra,
      target_number: out_target_number,
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
    // Spend(9) requirement: Output posix time is the averaged current time
    expect (out_current_posix_time == averaged_current_time)?
    //
    // Spend(10) requirement: Output block number is the input block number + 1
    // Spend(11) requirement: Output current hash is the target hash
    expect
      (block_number + 1 == out_block_number && out_current_hash == found_bytearray)?
    //Spend(12) requirement: Check output extra field is within a certain size
    expect (builtin.length_of_bytearray(builtin.serialise_data(extra)) <= 512)?
    // Spend(13) requirement: Check output interlink is correct
    (fortuna.calculate_interlink(
      interlink,
      found_bytearray,
      found_leading_zeros,
      found_target_number,
      target_number,
      leading_zeros,
    ) == out_interlink)?
  }
}

validator {
  fn dummy(_state: TargetState, _rdmr: ByteArray, _ctx) -> Bool {
    False
  }
}
