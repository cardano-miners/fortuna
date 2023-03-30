use aiken/builtin
use aiken/bytearray
use aiken/hash.{sha2_256}
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/list
use aiken/transaction.{
  InlineDatum, Input, Mint, Output, OutputReference, ScriptContext, Spend,
  TransactionId,
}
use aiken/transaction/credential.{ScriptCredential}
use aiken/transaction/value.{
  PolicyId, Value, flatten, quantity_of, without_lovelace,
}

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

fn own_validator_input_utxo(
  inputs: List<Input>,
  output_reference: OutputReference,
) -> Output {
  expect Some(input) =
    list.find(inputs, fn(input) { input.output_reference == output_reference })
  input.output
}

fn create_ff_byte(times: Int) -> ByteArray {
  if times == 2 {
    #"ff"
  } else {
    bytearray.concat(create_ff_byte(times - 2), #"ff")
  }
}

fn create_00_byte(times: Int) -> ByteArray {
  if times == 2 {
    #"00"
  } else {
    bytearray.concat(create_00_byte(times - 2), #"00")
  }
}

fn create_difficulty(leading_zeros: Int) -> ByteArray {
  if leading_zeros <= 0 {
    #"ffffffffffffffffffffffffffffffff"
  } else if leading_zeros >= 32 {
    #"00000000000000000000000000000000"
  } else {
    if leading_zeros % 2 == 0 {
      bytearray.concat(
        create_00_byte(leading_zeros),
        create_ff_byte(32 - leading_zeros),
      )
    } else {
      bytearray.concat(
        create_00_byte(leading_zeros - 1),
        bytearray.concat(#"0f", create_ff_byte(32 - leading_zeros - 1)),
      )
    }
  }
}

test create_difficulty_1() {
  create_difficulty(4) == #"0000ffffffffffffffffffffffffffff"
}

test create_difficulty_2() {
  create_difficulty(5) == #"00000fffffffffffffffffffffffffff"
}

test create_difficulty_3() {
  create_difficulty(17) == #"00000000000000000fffffffffffffff"
}

test create_difficulty_4() {
  create_difficulty(32) == #"00000000000000000000000000000000"
}

test create_difficulty_5() {
  create_difficulty(0) == #"ffffffffffffffffffffffffffffffff"
}

fn two_exponential(exponent: Int) -> Int {
  if exponent == 0 {
    1
  } else {
    two_exponential(exponent - 1) * 2
  }
}

test two_exponential_1() {
  two_exponential(0) == 1
}

test two_exponential_2() {
  two_exponential(5) == 32
}

test two_exponential_3() {
  two_exponential(27) == 134217728
}

test two_exponential_4() {
  two_exponential(1) == 2
}

test two_exponential_5() {
  two_exponential(29) == 536870912
}

fn value_contains_master_token(val: Value, own_policy: PolicyId) -> Bool {
  expect [(policy, token_name, quantity)] =
    val
      |> without_lovelace()
      |> flatten()

  policy == own_policy && token_name == "Master" && quantity == 1
}

fn get_difficulty_adjustment(total_epoch_time: Int) -> (Int, Int) {
  if
  epoch_target / total_epoch_time >= 4 && epoch_target % total_epoch_time > 0{
  
    (4, 1)
  } else if total_epoch_time / epoch_target >= 4 && total_epoch_time % epoch_target > 0 {
    (1, 4)
  } else {
    (epoch_target, total_epoch_time)
  }
}

test get_difficulty_adjustment_1() {
  get_difficulty_adjustment(1209600) == (1209600, 1209600)
}

test get_difficulty_adjustment_2() {
  get_difficulty_adjustment(1200600) == (1209600, 1200600)
}

test get_difficulty_adjustment_3() {
  get_difficulty_adjustment(50000000) == (1, 4)
}

test get_difficulty_adjustment_4() {
  get_difficulty_adjustment(200000) == (4, 1)
}

fn get_new_difficulty(
  current_leading_zeros: Int,
  adjustment_numerator: Int,
  adjustment_denominator: Int,
) -> Int {
  let new_leading_zeros_padded =
    current_leading_zeros * adjustment_numerator * padding / adjustment_denominator

  let new_leading_zeros =
    if new_leading_zeros_padded % padding >= 500 {
      new_leading_zeros_padded / padding + 1
    } else {
      new_leading_zeros_padded / padding
    }

  new_leading_zeros
}

test get_new_difficulty_1() {
  get_new_difficulty(4, 4, 1) == 16
}

test get_new_difficulty_2() {
  get_new_difficulty(8, 1, 4) == 2
}

test get_new_difficulty_3() {
  get_new_difficulty(16, 56, 37) == 24
}

test get_new_difficulty_4() {
  get_new_difficulty(16, 57, 37) == 25
}

test get_new_difficulty_5() {
  get_new_difficulty(2, 1, 3) == 1
}

test get_new_difficulty_6() {
  get_new_difficulty(1, 1, 3) == 0
}

const halving_number =
  210000

const epoch_number =
  2016

const epoch_target =
  1209600

const initial_payout =
  500000000

const padding =
  1000

validator {
  fn mint(state: MintingState, ctx: ScriptContext) -> Bool {
    when state is {
      Setup -> {
        let utxo_ref =
          OutputReference {
            transaction_id: TransactionId { hash: "<HASH>" },
            output_index: 0,
          }
        let ScriptContext { transaction: tx, purpose: Mint(own_policy) } =
          ctx
        // Add in entropy from a reference output
        expect Some(bootstrap_input) =
          list.find(
            tx.reference_inputs,
            fn(input) { input.output_reference == utxo_ref },
          )
        expect InlineDatum(bootstrap_datum) =
          bootstrap_input.output.datum
        // Entropy Initial hash. No need for difficulty check
        let bootstrap_hash =
          bootstrap_datum
            |> builtin.serialise_data()
            |> sha2_256()
            |> sha2_256()
        // Expect one ouput with payment credential matching policy id
        expect [Output { datum: InlineDatum(output_datum), value, .. }] =
          list.filter(
            tx.outputs,
            fn(output) {
              output.address.payment_credential == ScriptCredential(own_policy)
            },
          )
        let mints_token =
          value_contains_master_token(tx.mint, own_policy)
        let has_output_token =
          value_contains_master_token(value, own_policy)
        expect output_state: State =
          output_datum
        // Check initial state is set to default
        let initial_state =
          State {
            block_number: 0,
            current_hash: bootstrap_hash,
            leading_zeros: 4,
            epoch_time: 0,
            extra: 0,
          }
        initial_state == output_state && has_output_token && mints_token
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
      own_validator_input_utxo(transaction.inputs, own_reference)

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
        |> sha2_256()

    let difficulty =
      create_difficulty(leading_zeros)

    let mining_check =
      builtin.less_than_equals_bytearray(target, difficulty)

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
      if halving_exponent > 29 {
        0
      } else {
        initial_payout / two_exponential(halving_exponent)
      }

    let mints_token =
      policy == own_validator_hash && token_name == "pow" && quantity == expected_quantity

    let has_output_token =
      value_contains_master_token(own_output.value, own_validator_hash)

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

    let difficulty_and_epoch_check =
      if block_number % epoch_number == 0 && block_number != 0 {
        // use total epoch time with target epoch time to get difficulty adjustment ratio
        // ratio maxes out at 4/1 and mins to 1/4
        let total_epoch_time =
          averaged_block_time + epoch_time

        let (adjustment_numerator, adjustment_denominator) =
          get_difficulty_adjustment(total_epoch_time)

        // Now use ratio to find new leading zeros difficulty
        let new_difficulty =
          get_new_difficulty(
            leading_zeros,
            adjustment_numerator,
            adjustment_denominator,
          )

        new_difficulty == out_leading_zeros && 0 == out_epoch_time
      } else {
        leading_zeros == out_leading_zeros && averaged_block_time + epoch_time == out_epoch_time
      }

    let output_state_valid =
      block_number + 1 == out_block_number && out_current_hash == target && difficulty_and_epoch_check

    // Check output extra field is within a certain size
    let extra_data_length_check =
      builtin.length_of_bytearray(builtin.serialise_data(extra)) <= 512

    mining_check && has_input_token && mints_token && has_output_token && time_range_check && output_state_valid && extra_data_length_check
  }
}
