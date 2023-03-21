use aiken/builtin
use aiken/bytearray
use aiken/hash.{sha2_256}
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/list
use aiken/transaction.{
  InlineDatum, Input, Mint, Output, OutputReference, ScriptContext, Spend,
}
use aiken/transaction/credential.{ScriptCredential}
use aiken/transaction/value.{flatten, quantity_of, without_lovelace}

type State {
  block_number: Int,
  current_hash: ByteArray,
  leading_zeros: Int,
  epoch_time: Int,
  extra: Data,
}

type InputNonce {
  nonce: ByteArray,
}

type MintingState {
  Active
  Setup
}

type TargetState {
  block_number: Int,
  current_hash: ByteArray,
  leading_zeros: Int,
  epoch_time: Int,
  nonce: ByteArray,
}

fn own_validator_input(
  inputs: List<Input>,
  output_reference: OutputReference,
) -> Output {
  inputs
    |> list.find(fn(input) { input.output_reference == output_reference })
    |> fn(a: Option<Input>) {
    expect Some(b) =
      a
    b.output
  }
}

fn create_difficulty(position: Int, leading_zeros: Int) -> ByteArray {
  if position == 32 {
    #""
  } else {
    let filler =
      if 32 - leading_zeros <= position {
        #"00"
      } else if 32 - leading_zeros <= position + 1 {
        #"0f"
      } else {
        #"ff"
      }

    bytearray.concat(create_difficulty(position + 2, leading_zeros), filler)
  }
}

fn two_exponential(exponent: Int) -> Int {
  if exponent == 0 {
    1
  } else {
    two_exponential(exponent - 1) * 2
  }
}

const halving_number =
  210000

const epoch_number =
  2016

const epoch_target =
  1209600000

const initial_payout =
  5000000000

validator(utxo_ref: OutputReference) {
  fn mint(state: MintingState, ctx: ScriptContext) -> Bool {
    when state is {
      Setup -> {
        let ScriptContext { transaction: tx, purpose: Mint(own_policy) } =
          ctx
        expect Some(bootstrap_input) =
          list.find(
            tx.reference_inputs,
            fn(input) { input.output_reference == utxo_ref },
          )
        expect InlineDatum(bootstrap_datum) =
          bootstrap_input.output.datum
        let bootstrap_hash =
          bootstrap_datum |> builtin.serialise_data() |> sha2_256()
        expect [Output { datum: InlineDatum(output_datum), value, .. }] =
          list.filter(
            tx.outputs,
            fn(output) {
              output.address.payment_credential == ScriptCredential(own_policy)
            },
          )
        let mints_token =
          when
            tx.mint
              |> without_lovelace()
              |> flatten()
          is {
            [(policy, token_name, quantity)] ->
              policy == own_policy && token_name == "Master" && quantity == 1
            _ ->
              False
          }
        let has_output_token =
          when
            value
              |> without_lovelace()
              |> flatten()
          is {
            [(policy, token_name, quantity)] ->
              policy == own_policy && token_name == "Master" && quantity == 1
            _ ->
              False
          }
        expect output_state: State =
          output_datum
        let correct_state =
          State {
            block_number: 0,
            current_hash: bootstrap_hash,
            leading_zeros: 4,
            epoch_time: 0,
            extra: 0,
          } == output_state
        correct_state && has_output_token && mints_token
      }
      Active -> {
        let ScriptContext { transaction: tx, purpose: Mint(own_policy) } =
          ctx
        list.any(
          tx.inputs,
          fn(input) {
            input.output.address.payment_credential == ScriptCredential(
              own_policy,
            )
          },
        )
      }
    }
  }

  fn spend(state: State, input: InputNonce, ctx: ScriptContext) -> Bool {
    // Access transaction information
    let State { block_number, current_hash, leading_zeros, epoch_time, .. } =
      state

    let transaction =
      ctx.transaction

    expect Spend(own_reference) =
      ctx.purpose

    let own_input =
      own_validator_input(transaction.inputs, own_reference)

    let credential =
      own_input.address.payment_credential

    expect ScriptCredential(own_validator_hash) =
      credential

    expect [own_output] =
      list.filter(
        transaction.outputs,
        fn(output: Output) { output.address.payment_credential == credential },
      )

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
    } =
      transaction.validity_range

    expect Finite(upper_range) =
      upper_range

    expect Finite(lower_range) =
      lower_range

    let time_range_check =
      upper_is_inclusive && lower_is_inclusive && upper_range - lower_range <= 180

    let averaged_block_time =
      ( upper_range - lower_range ) / 2 + lower_range

    // Mining Diffculty Met
    let target =
      TargetState {
        nonce: input.nonce,
        epoch_time,
        block_number,
        current_hash,
        leading_zeros,
      }

    let target =
      target
        |> builtin.serialise_data()
        |> sha2_256()

    let difficulty =
      create_difficulty(0, leading_zeros)

    let mining_check =
      builtin.less_than_bytearray(target, difficulty)

    // Input has master token
    let has_input_token =
      quantity_of(own_input.value, own_validator_hash, "Master")

    let has_input_token =
      has_input_token == 1

    // Mint contains proper quantity of pow token
    expect [(policy, token_name, quantity)] =
      transaction.mint
        |> without_lovelace()
        |> flatten()
    let halving_exponent =
      block_number / halving_number
    let expected_quantity =
      if halving_exponent > 28 {
        0
      } else {
        initial_payout / two_exponential(halving_exponent)
      }
    let mints_token =
      policy == own_validator_hash && token_name == "pow" && quantity == expected_quantity

    // Own output contains master token
    expect [(policy, token_name, quantity)] =
      own_output.value
        |> without_lovelace()
        |> flatten()

    let has_output_token =
      policy == own_validator_hash && token_name == "Master" && quantity == 1

    // Check output datum contains correct epoch time, block number, hash, and leading zeros
    // Check for every divisible by 2016 block: 
    // - Epoch time resets
    // - leading zeros is adjusted based on percent of hardcoded target time for 2016 blocks vs epoch time
    expect InlineDatum(output_datum) =
      own_output.datum
    expect State {
      block_number: out_block_number,
      current_hash: out_current_hash,
      leading_zeros: out_leading_zeros,
      epoch_time: out_epoch_time,
      extra,
    }: State =
      output_datum

    let (expected_epoch_time, expected_leading_zeros) =
      if block_number % epoch_number == 0 {
        // use total epoch time with target epoch time to get difficulty adjustment ratio
        // ratio maxes out at 4/1 and mins to 1/4
        let total_epoch_time =
          averaged_block_time + epoch_time
        let (change_numerator, change_denominator) =
          if epoch_target / total_epoch_time > 4 {
            (4, 1)
          } else if total_epoch_time / epoch_target > 4 {
            (1, 4)
          } else {
            (epoch_target, total_epoch_time)
          }

        // Now use ratio to find new leading zeros difficulty
        let padding =
          1000
        let new_leading_zeros_padded =
          leading_zeros * change_numerator * padding / change_denominator
        let new_leading_zeros =
          if new_leading_zeros_padded % padding >= 500 {
            new_leading_zeros_padded / padding + 1
          } else {
            new_leading_zeros_padded / padding
          }

        let final =
          (0, new_leading_zeros)
        final
      } else {
        (epoch_time + averaged_block_time, leading_zeros)
      }

    let output_state_valid =
      block_number + 1 == out_block_number && out_current_hash == target && expected_epoch_time == out_epoch_time && expected_leading_zeros == out_leading_zeros

    // Check output extra field is within a certain size
    let extra_data_length_check =
      builtin.length_of_bytearray(builtin.serialise_data(extra)) <= 256

    mining_check && has_input_token && mints_token && has_output_token && time_range_check && output_state_valid && extra_data_length_check
  }
}
