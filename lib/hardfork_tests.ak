use hardfork_validation.{calculate_emission, check_block_signal}

test calculate_emission_1() {
  calculate_emission(3000) == 15000000000000
}

test calculate_emission_2() {
  calculate_emission(210000) == 1050000000000000
}

test calculate_emission_3() {
  calculate_emission(210001) == 1050002500000000
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
