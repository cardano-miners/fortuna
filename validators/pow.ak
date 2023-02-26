use aiken/builtin
use aiken/bytearray
use aiken/hash.{sha2_256}
use aiken/list
use aiken/option
use aiken/transaction.{Input, Output, OutputReference, ScriptContext, Spend}
use aiken/transaction/credential.{ScriptCredential}
use aiken/transaction/value.{quantity_of}

pub type State {
  block_number: Int,
  current_hash: ByteArray,
  leading_zeros: Int,
  epoch_time: Int,
  extra: Data,
}

pub type InputNonce {
  nonce: ByteArray,
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
) -> Option<Output> {
  inputs
  |> list.find(fn(input) { input.output_reference == output_reference })
  |> option.map(fn(v) { v.output })
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

validator pow {
  fn(state: State, input: InputNonce, ctx: ScriptContext) -> Bool {
    let State { block_number, current_hash, leading_zeros, epoch_time, .. } =
      state
    let transaction = ctx.transaction

    expect Spend(own_reference) = ctx.purpose

    expect Some(own_input) =
      own_validator_input(transaction.inputs, own_reference)

    let credential = own_input.address.payment_credential

    expect ScriptCredential(own_validator_hash) = credential

    let own_output = when
      list.filter(
        transaction.outputs,
        fn(output: Output) { output.address.payment_credential == credential },
      )
    is {
      [o] -> o
      _ -> error @"Should be only one output."
    }

    // Time Range Span is 3 minutes or less 
    // TODO: Compare intervals for valid from and until to ensure 3 minute gap or less
    // Mining Diffculty Met
    let target =
      TargetState {
        nonce: input.nonce,
        //TODO
        epoch_time,
        block_number,
        current_hash,
        leading_zeros,
      }

    let target =
      target
      |> builtin.serialise_data()
      |> sha2_256()

    let difficulty = create_difficulty(0, leading_zeros)

    let mining_check = builtin.less_than_bytearray(target, difficulty)

    // Input has master token
    let has_input_token =
      quantity_of(own_input.value, own_validator_hash, "Master")

    let has_input_token = has_input_token == 1

    // Mint contains greater than 1 quantity of pow token
    let mints_token =
      quantity_of(transaction.mint, own_validator_hash, "pow") > 1

    // Own output contains master token
    let has_output_token =
      quantity_of(own_output.value, own_validator_hash, "Master")

    let has_output_token = has_output_token == 1

    // Check output datum contains correct epoch time, block number, hash, and leading zeros
    // Check for every divisible by 2016 block: 
    // - Epoch time resets
    // - leading zeros is adjusted based on percent of hardcoded target time for 2016 blocks vs epoch time
    // TODO
    // Check output extra field is within a certain size
    // TODO
    mining_check && has_input_token && mints_token && has_output_token
  }
}
