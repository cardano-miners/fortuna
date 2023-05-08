use aiken/builtin
use aiken/bytearray
use aiken/dict
use aiken/hash.{sha2_256}
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/list
use aiken/transaction.{
  InlineDatum, Input, Mint, Output, OutputReference, ScriptContext, Spend,
  Transaction,
}
use aiken/transaction/credential.{ScriptCredential}
use aiken/transaction/value.{PolicyId, Value, quantity_of, tokens}

type State {
  block_number: Int,
  current_hash: ByteArray,
  leading_zeros: Int,
  difficulty_number: Int,
  epoch_time: Int,
  extra: Data,
  interlink: List<ByteArray>,
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
  difficulty_number: Int,
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

fn create_00_byte(times: Int) -> ByteArray {
  if times <= 0 {
    #""
  } else {
    bytearray.concat(create_00_byte(times - 2), #"00")
  }
}

fn create_00_byte_multiple(times: Int) -> ByteArray {
  if times >= 10 {
    bytearray.concat(create_00_byte_multiple(times - 10), #"0000000000")
  } else {
    create_00_byte(times)
  }
}

// Create a bytearray number that is based on leading zeros and a difficulty number that fits in 2 bytes
fn create_difficulty(difficulty_number: Int, leading_zeros: Int) -> ByteArray {
  if leading_zeros % 2 == 0 {
    let difficulty_number_bytes =
      builtin.cons_bytearray(
        // 65536 is 256 * 256
        difficulty_number % 65536 / 256,
        builtin.cons_bytearray(difficulty_number, #""),
      )

    bytearray.concat(
      bytearray.concat(
        create_00_byte_multiple(leading_zeros),
        difficulty_number_bytes,
      ),
      // -2 bytes for difficulty number spot
      create_00_byte_multiple(64 - leading_zeros - 4),
    )
  } else {
    let difficulty_number_bytes =
      builtin.cons_bytearray(
        // 65536 is 256 * 256
        difficulty_number % 65536 / 4096,
        builtin.cons_bytearray(
          difficulty_number % 4096 / 16,
          builtin.cons_bytearray(difficulty_number % 16 * 16, #""),
        ),
      )

    bytearray.concat(
      bytearray.concat(
        create_00_byte_multiple(leading_zeros - 1),
        difficulty_number_bytes,
      ),
      // -5 bytes for difficulty number spot
      create_00_byte_multiple(64 - leading_zeros - 5),
    )
  }
}

test create_difficulty_1() {
  create_difficulty(50005, 5) == #"00000c3550000000000000000000000000000000000000000000000000000000"
}

test create_difficulty_2() {
  create_difficulty(50000, 5) == #"00000c3500000000000000000000000000000000000000000000000000000000"
}

test create_difficulty_3() {
  create_difficulty(257, 4) == #"0000010100000000000000000000000000000000000000000000000000000000"
}

test create_difficulty_4() {
  create_difficulty(257, 30) == #"0000000000000000000000000000000101000000000000000000000000000000"
}

test create_difficulty_5() {
  create_difficulty(65535, 0) == #"ffff000000000000000000000000000000000000000000000000000000000000"
}

test create_difficulty_6() {
  create_difficulty(40000, 18) == #"0000000000000000009c40000000000000000000000000000000000000000000"
}

test create_difficulty_7() {
  create_difficulty(40000, 60) == #"0000000000000000000000000000000000000000000000000000000000009c40"
}

fn do_two_exponential(exponent: Int) -> Int {
  if exponent <= 0 {
    1
  } else {
    do_two_exponential(exponent - 1) * 2
  }
}

fn two_exponential(exponent: Int) -> Int {
  if exponent >= 5 {
    32 * two_exponential(exponent - 5)
  } else {
    do_two_exponential(exponent)
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
  expect [(token_name, quantity)] =
    val
      |> tokens(own_policy)
      |> dict.to_list()

  token_name == "Master" && quantity == 1
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
  difficulty_number: Int,
  current_leading_zeros: Int,
  adjustment_numerator: Int,
  adjustment_denominator: Int,
) -> (Int, Int) {
  let new_padded_difficulty =
    difficulty_number * padding * adjustment_numerator / adjustment_denominator

  let new_difficulty =
    new_padded_difficulty / padding

  if new_padded_difficulty / 65536 == 0 {
    if current_leading_zeros >= 30 {
      (4096, 60)
    } else {
      (new_padded_difficulty, current_leading_zeros + 1)
    }
  } else if new_difficulty / 65536 > 0 {
    if current_leading_zeros <= 2 {
      (65535, 2)
    } else {
      (new_difficulty / padding, current_leading_zeros - 1)
    }
  } else {
    (new_difficulty, current_leading_zeros)
  }
}

test get_new_difficulty_1() {
  get_new_difficulty(20001, 4, 4, 1) == (5000, 3)
}

test get_new_difficulty_2() {
  get_new_difficulty(20001, 4, 1, 4) == (5000, 4)
}

test get_new_difficulty_3() {
  get_new_difficulty(5005, 4, 1, 4) == (20020, 5)
}

test get_new_difficulty_4() {
  get_new_difficulty(9000, 6, 57, 37) == (13864, 6)
}

test get_new_difficulty_5() {
  get_new_difficulty(30000, 4, 3, 1) == (5625, 3)
}

test get_new_difficulty_6() {
  get_new_difficulty(9000, 4, 1, 3) == (48000, 5)
}

test get_new_difficulty_7() {
  get_new_difficulty(9000, 60, 1, 3) == (4096, 60)
}

test get_new_difficulty_8() {
  get_new_difficulty(27000, 2, 3, 1) == (65535, 2)
}

fn do_calculate_interlink(
  interlink: List<ByteArray>,
  current_hash: ByteArray,
  difficulty_number: Int,
  leading_zeros: Int,
) -> List<ByteArray> {
  let (halved_difficulty, halved_leading_zeroes) =
    get_new_difficulty(difficulty_number, leading_zeros, 1, 2)
  let half_target =
    create_difficulty(halved_difficulty, halved_leading_zeroes)

  if builtin.less_than_equals_bytearray(current_hash, half_target) {
    when interlink is {
      [] ->
        [
          current_hash,
          ..do_calculate_interlink(
            [],
            current_hash,
            halved_difficulty,
            halved_leading_zeroes,
          )
        ]
      [_, ..rest] ->
        [
          current_hash,
          ..do_calculate_interlink(
            rest,
            current_hash,
            halved_difficulty,
            halved_leading_zeroes,
          )
        ]
    }
  } else {
    interlink
  }
}

fn calculate_interlink(
  interlink: List<ByteArray>,
  current_hash: ByteArray,
  difficulty_number: Int,
  leading_zeros: Int,
) -> List<ByteArray> {
  let (quarter_difficulty, quarter_leading_zeroes) =
    get_new_difficulty(difficulty_number, leading_zeros, 1, 4)
  let quarter_target =
    create_difficulty(quarter_difficulty, quarter_leading_zeroes)

  if builtin.less_than_equals_bytearray(current_hash, quarter_target) {
    when interlink is {
      [] ->
        [
          current_hash,
          current_hash,
          ..calculate_interlink(
            [],
            current_hash,
            quarter_difficulty,
            quarter_leading_zeroes,
          )
        ]
      [_] ->
        [
          current_hash,
          current_hash,
          ..calculate_interlink(
            [],
            current_hash,
            quarter_difficulty,
            quarter_leading_zeroes,
          )
        ]
      [_, _, ..rest] ->
        [
          current_hash,
          current_hash,
          ..calculate_interlink(
            rest,
            current_hash,
            quarter_difficulty,
            quarter_leading_zeroes,
          )
        ]
    }
  } else {
    do_calculate_interlink(
      interlink,
      current_hash,
      difficulty_number,
      leading_zeros,
    )
  }
}

test interlink_1() {
  let current_hash =
    #"0000000000000000009c40000000000000000000000000000000000000000000"
  calculate_interlink([], current_hash, 40000, 5) == [
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
  ]
}

test interlink_2() {
  let current_hash =
    #"0000000000000000000000000000000101000000000000000000000000000000"
  calculate_interlink([], current_hash, 40000, 5) == [
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
  ]
}

test interlink_3() {
  let prev_hash =
    #"0000000000000000009c40000000000000000000000000000000000000000000"

  let current_hash =
    #"0000000000000000000000000000000101000000000000000000000000000000"
  calculate_interlink(
    [prev_hash, prev_hash, prev_hash, prev_hash, prev_hash, prev_hash],
    current_hash,
    40000,
    5,
  ) == [
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
  ]
}

test interlink_4() {
  let prev_hash =
    #"0000000000000000000000000000000101000000000000000000000000000000"

  let current_hash =
    #"0000000000000000009c40000000000000000000000000000000000000000000"

  let current_list =
    [
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
      prev_hash,
    ]

  calculate_interlink(current_list, current_hash, 40000, 5) == [
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    current_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
    prev_hash,
  ]
}

const halving_number =
  210000

const epoch_number =
  2016

const epoch_target =
  1209600

const initial_payout =
  5000000000

const padding =
  16

validator(utxo_ref: OutputReference) {
  fn mint(state: MintingState, ctx: ScriptContext) -> Bool {
    when state is {
      Setup -> {
        let ScriptContext { transaction: tx, purpose: Mint(own_policy) } =
          ctx

        let Transaction { inputs, outputs, mint, .. } =
          tx
        // Add in entropy from a reference output
        // Entropy Initial hash. No need for difficulty check
        expect Some(_) =
          list.find(inputs, fn(input) { input.output_reference == utxo_ref })

        let bootstrap_hash =
          utxo_ref
            |> builtin.serialise_data()
            |> sha2_256()
            |> sha2_256()
        // Expect one ouput with payment credential matching policy id
        expect [Output { datum: InlineDatum(output_datum), value, .. }] =
          list.filter(
            outputs,
            fn(output) {
              output.address.payment_credential == ScriptCredential(own_policy)
            },
          )
        let mints_token =
          value_contains_master_token(mint, own_policy)
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
            difficulty_number: 65535,
            epoch_time: 0,
            extra: 0,
            interlink: [],
          }
        initial_state == output_state && has_output_token && mints_token
      }
      Active -> {
        let ScriptContext { transaction: tx, purpose: Mint(own_policy) } =
          ctx

        let own_credential =
          ScriptCredential(own_policy)
        list.any(
          tx.inputs,
          fn(input) {
            input.output.address.payment_credential == own_credential
          },
        )
      }
    }
  }

  fn spend(state: State, input: InputNonce, ctx: ScriptContext) -> Bool {
    // Access transaction information
    let State {
      block_number,
      current_hash,
      leading_zeros,
      difficulty_number,
      epoch_time,
      interlink,
      ..
    } =
      state

    let ScriptContext { transaction, purpose } =
      ctx
    expect Spend(own_reference) =
      purpose

    let Transaction { inputs, outputs, mint, validity_range, .. } =
      transaction

    let own_input =
      own_validator_input_utxo(inputs, own_reference)

    let Output { address: in_address, value: in_value, .. } =
      own_input

    let credential =
      in_address.payment_credential

    expect ScriptCredential(own_validator_hash) =
      credential

    expect [own_output] =
      list.filter(
        outputs,
        fn(output: Output) { output.address.payment_credential == credential },
      )

    let Output { datum: out_datum, value: out_value, .. } =
      own_output

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
      validity_range

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
        difficulty_number,
      }

    let target =
      target
        |> builtin.serialise_data()
        |> sha2_256()
        |> sha2_256()

    let difficulty =
      create_difficulty(difficulty_number, leading_zeros)

    let mining_check =
      builtin.less_than_equals_bytearray(target, difficulty)

    // Input has master token
    let has_input_token =
      quantity_of(in_value, own_validator_hash, "Master")

    let has_input_token =
      has_input_token == 1

    // Mint contains proper quantity of pow token
    expect [(token_name, quantity)] =
      mint
        |> tokens(own_validator_hash)
        |> dict.to_list

    let halving_exponent =
      block_number / halving_number

    let expected_quantity =
      if halving_exponent > 29 {
        0
      } else {
        initial_payout / two_exponential(halving_exponent)
      }

    let mints_token =
      token_name == "pow" && quantity == expected_quantity

    let has_output_token =
      value_contains_master_token(out_value, own_validator_hash)

    // Check output datum contains correct epoch time, block number, hash, and leading zeros
    // Check for every divisible by 2016 block: 
    // - Epoch time resets
    // - leading zeros is adjusted based on percent of hardcoded target time for 2016 blocks vs epoch time
    expect InlineDatum(output_datum) =
      out_datum

    expect State {
      block_number: out_block_number,
      current_hash: out_current_hash,
      leading_zeros: out_leading_zeros,
      epoch_time: out_epoch_time,
      interlink: out_interlink,
      extra,
      difficulty_number: out_difficulty_number,
    }: State =
      output_datum

    let difficulty_and_epoch_check =
      if block_number % epoch_number == 0 && block_number > 0 {
        // use total epoch time with target epoch time to get difficulty adjustment ratio
        // ratio maxes out at 4/1 and mins to 1/4
        let total_epoch_time =
          averaged_block_time + epoch_time

        let (adjustment_numerator, adjustment_denominator) =
          get_difficulty_adjustment(total_epoch_time)

        // Now use ratio to find new leading zeros difficulty
        let (new_difficulty, new_leading_zeroes) =
          get_new_difficulty(
            difficulty_number,
            leading_zeros,
            adjustment_numerator,
            adjustment_denominator,
          )

        new_leading_zeroes == out_leading_zeros && 0 == out_epoch_time && out_difficulty_number == new_difficulty
      } else {
        let new_epoch_time =
          averaged_block_time + epoch_time
        leading_zeros == out_leading_zeros && out_difficulty_number == difficulty_number && new_epoch_time == out_epoch_time
      }

    let output_state_valid =
      block_number + 1 == out_block_number && out_current_hash == target && difficulty_and_epoch_check

    // Check output extra field is within a certain size
    let extra_data_length_check =
      builtin.length_of_bytearray(builtin.serialise_data(extra)) <= 512

    let interlink_check =
      calculate_interlink(
        interlink,
        out_current_hash,
        difficulty_number,
        leading_zeros,
      ) == out_interlink

    mining_check && has_input_token && mints_token && has_output_token && time_range_check && output_state_valid && extra_data_length_check && interlink_check
  }
}
