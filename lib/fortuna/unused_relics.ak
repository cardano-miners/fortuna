use aiken/builtin
use aiken/bytearray

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
