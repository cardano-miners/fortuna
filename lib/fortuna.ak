use aiken/builtin
use aiken/bytearray
use aiken/dict
use aiken/list
use aiken/transaction.{Input, Output, OutputReference}
use aiken/transaction/value.{PolicyId, Value, tokens}
use fortuna/parameters.{epoch_target, padding}

pub fn own_validator_input_utxo(
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
pub fn create_difficulty(
  difficulty_number: Int,
  leading_zeros: Int,
) -> ByteArray {
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

pub fn two_exponential(exponent: Int) -> Int {
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

pub fn value_contains_master_token(val: Value, own_policy: PolicyId) -> Bool {
  expect [(token_name, quantity)] =
    val
      |> tokens(own_policy)
      |> dict.to_list()

  token_name == "Master" && quantity == 1
}

pub fn get_difficulty_adjustment(total_epoch_time: Int) -> (Int, Int) {
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

pub fn get_new_difficulty(
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

pub fn calculate_interlink(
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
