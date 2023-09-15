use aiken/builtin
use aiken/dict
use aiken/hash.{blake2b_256, sha2_256}
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/list
use aiken/transaction.{
  InlineDatum, Mint, Output, OutputReference, ScriptContext, Spend, Transaction,
} as tx
use aiken/transaction/credential.{Address, Inline, ScriptCredential}
use aiken/transaction/value.{tokens}
use fortuna
use fortuna/parameters.{epoch_number, halving_number, initial_payout}
use fortuna/types.{State}
use fortuna/utils.{list_at, quantity_of}

type TunaAction {
  Genesis
  Mine
  Redeem(OutputReference)
}

type Miner {
  Pkh(ByteArray)
  Nft(ByteArray, ByteArray)
}

type MineAction {
  nonce: ByteArray,
  miner: Miner,
  nft_input_ref: Option<OutputReference>,
}

type TargetState {
  nonce: ByteArray,
  epoch_time: Int,
  block_number: Int,
  current_hash: ByteArray,
  leading_zeros: Int,
  difficulty_number: Int,
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
          quantity_of(out_value, fork_hash, hard_fork_state_token) == 1,
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
      difficulty_number,
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

    let MineAction { nonce, miner, nft_input_ref } = redeemer

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
        Nft(nft_policy, nft_name) -> {
          expect Some(input_ref) = nft_input_ref
          //
          let quantity =
            utils.resolve_output_reference(inputs, input_ref).value
              |> quantity_of(nft_policy, nft_name)
          //
          // Spend(2) requirement: Input has nft
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
        difficulty_number,
        miner: blake2b_256(builtin.serialise_data(miner)),
      }

    let found_bytearray =
      target
        |> builtin.serialise_data()
        |> sha2_256()
        |> sha2_256()

    let (found_difficulty_number, found_leading_zeros) =
      fortuna.format_found_bytearray(found_bytearray)

    // Mining Difficulty Met
    // Spend(2) requirement: Found difficulty is less than or equal to the current difficulty
    // We do this by checking the leading zeros and the difficulty number
    expect or {
        (found_leading_zeros > leading_zeros)?,
        and {
          (found_leading_zeros == leading_zeros)?,
          (found_difficulty_number < difficulty_number)?,
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
        initial_payout / fortuna.two_exponential(halving_exponent)
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
      difficulty_number: out_difficulty_number,
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
            difficulty_number,
            leading_zeros,
            adjustment_numerator,
            adjustment_denominator,
          )
        //
        and {
          (new_leading_zeroes == out_leading_zeros)?,
          (new_difficulty == out_difficulty_number)?,
          (0 == out_epoch_time)?,
        }
      } else {
        let new_epoch_time =
          epoch_time + averaged_current_time - current_posix_time
        // 
        and {
          (leading_zeros == out_leading_zeros)?,
          (difficulty_number == out_difficulty_number)?,
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
        found_difficulty_number,
        difficulty_number,
        leading_zeros,
      ) == out_interlink)?,
    }
  }
}

type HardForkStatus {
  NotForked
  Forked
  FailedFork
}

type LockStateType {
  Miner(ByteArray)
  Regular
}

type ForkDatum {
  HardForkState { status: HardForkStatus, fork_block_height: Int }
  GlobalLockState { locked_tuna: Int, lock_state_type: LockStateType }
  NftState { nft_key: ByteArray }
}

type NftForkAction {
  Initialize
  Lock {
    hard_fork_state_ref: OutputReference,
    lock_output_index: Int,
    nft_output_index: Int,
    out_key_index: Option<Int>,
    fortuna_v1_input_ref: Option<OutputReference>,
  }
  HardFork { hard_fork_state_ref: OutputReference }
  Unlock { hard_fork_state_ref: OutputReference }
  Burn { hard_fork_state_ref: OutputReference }
}

const miner_lock_state_token: ByteArray = "miner_lock_state"

const lock_state_token: ByteArray = "lock_state"

const hard_fork_state_token: ByteArray = "hfs"

const initial_readiness: ByteArray =
  #"00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"

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

        let Transaction { inputs, reference_inputs, outputs, mint, .. } =
          transaction

        when action is {
          // Check if the input is spent and proper initial state is made
          // No need to check spends from own script hash in intialize
          // The reason being is no meaningful locks can happen before initialize
          Initialize -> {
            let mint = value.from_minted_value(mint)

            let hfs_output = list_at(outputs, 0)
            let miner_state_output = list_at(outputs, 1)
            let lock_state_output = list_at(outputs, 2)

            let own_address =
              Address {
                payment_credential: ScriptCredential(own_policy),
                stake_credential: None,
              }

            // The reason we check minted amount but not token name 
            // is because we check the token names and presence in the outputs back to this script
            // Plus this action can only be run once in the lifetime of this script
            expect [(_, 1), (_, 1), (_, 1)] =
              mint |> tokens(own_policy) |> dict.to_list

            let genesis_input =
              utils.resolve_output_reference(inputs, init_utxo_ref)

            let Output {
              address: hfs_address,
              value: hfs_value,
              datum: hfs_datum,
              ..
            } = hfs_output

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

            expect HardForkState { status: NotForked, .. }: ForkDatum =
              hfs_datum

            expect GlobalLockState {
              locked_tuna: 0,
              lock_state_type: Miner(readiness),
            }: ForkDatum = miner_state_datum

            expect GlobalLockState { locked_tuna: 0, lock_state_type: Regular }: ForkDatum =
              lock_state_datum

            and {
              own_address == hfs_address,
              own_address == miner_state_address,
              own_address == lock_state_address,
              quantity_of(hfs_value, own_policy, hard_fork_state_token) == 1,
              quantity_of(miner_state_value, own_policy, miner_lock_state_token) == 1,
              quantity_of(lock_state_value, own_policy, lock_state_token) == 1,
              initial_readiness == readiness,
              genesis_input == genesis_input,
            }
          }

          Lock {
            hard_fork_state_ref,
            out_key_index,
            nft_output_index,
            lock_output_index,
            fortuna_v1_input_ref,
          } -> {
            let hard_fork_state_input =
              utils.resolve_output_reference(
                reference_inputs,
                hard_fork_state_ref,
              )

            expect
              utils.value_has_nft_and_lovelace(
                hard_fork_state_input.value,
                own_policy,
                hard_fork_state_token,
              )
            //
            expect InlineDatum(hard_fork_state_datum) =
              hard_fork_state_input.datum

            expect HardForkState { status, .. }: ForkDatum =
              hard_fork_state_datum

            when status is {
              NotForked -> {
                let own_address =
                  Address {
                    payment_credential: ScriptCredential(own_policy),
                    stake_credential: None,
                  }

                let script_inputs =
                  utils.filter_resolved_inputs(
                    inputs,
                    fn(input) { input.output.address == own_address },
                  )

                // validate nft state output
                let nft_output = list_at(outputs, nft_output_index)
                //
                expect InlineDatum(nft_datum) = nft_output.datum
                //
                expect NftState { nft_key: out_nft_key }: ForkDatum = nft_datum

                let out_tuna_quantity =
                  nft_output.value
                    |> quantity_of(fortuna_v1_hash, fortuna.token_name)

                // validate lock state output
                let lock_output = list_at(outputs, lock_output_index)

                expect InlineDatum(out_lock_datum) = lock_output.datum

                let (
                  prev_held_amount,
                  in_locked_tuna,
                  in_lock_state_type,
                  in_state_value,
                ) =
                  when script_inputs is {
                    [] -> fail @"No script inputs"

                    [script_input1] -> {
                      // validate mint
                      // Use blake hash since it's faster and this is unrelated to Proof of Work
                      let own_token_name =
                        builtin.head_list(inputs).output_reference
                          |> builtin.serialise_data
                          |> blake2b_256

                      //
                      expect [(mint_token_name, 1)] =
                        mint
                          |> value.from_minted_value
                          |> value.tokens(own_policy)
                          |> dict.to_list

                      // Fork Lock(0) requirement: Minted token name is derived from the input ref
                      expect own_token_name == mint_token_name
                      //
                      // Fork Lock(1) requirement: NFT key is the same as the owner key at the output
                      expect out_nft_key == own_token_name
                      //
                      expect InlineDatum(datum) = script_input1.datum

                      expect GlobalLockState {
                        locked_tuna: in_locked_tuna,
                        lock_state_type: in_lock_state_type,
                      }: ForkDatum = datum

                      (
                        0,
                        in_locked_tuna,
                        in_lock_state_type,
                        script_input1.value,
                      )
                    }

                    [script_input1, script_input2] -> {
                      expect Some(out_key_index) = out_key_index

                      // Check Nft Key is spent in the tx to prove ownership
                      expect
                        quantity_of(
                          list_at(outputs, out_key_index).value,
                          own_policy,
                          out_nft_key,
                        ) == 1
                      //
                      expect InlineDatum(datum) = script_input1.datum

                      expect script1_datum: ForkDatum = datum

                      when script1_datum is {
                        GlobalLockState { locked_tuna, lock_state_type } -> {
                          expect InlineDatum(script2_datum) =
                            script_input2.datum

                          expect NftState { nft_key }: ForkDatum = script2_datum

                          expect nft_key == out_nft_key
                          //
                          let prev_held_amount =
                            script_input2.value
                              |> quantity_of(fortuna_v1_hash, fortuna.token_name)

                          (
                            prev_held_amount,
                            locked_tuna,
                            lock_state_type,
                            script_input1.value,
                          )
                        }
                        NftState { nft_key } -> {
                          expect nft_key == out_nft_key
                          //
                          expect InlineDatum(script2_datum) =
                            script_input2.datum

                          expect GlobalLockState {
                            locked_tuna,
                            lock_state_type,
                          }: ForkDatum = script2_datum

                          let prev_held_amount =
                            script_input1.value
                              |> quantity_of(fortuna_v1_hash, fortuna.token_name)

                          (
                            prev_held_amount,
                            locked_tuna,
                            lock_state_type,
                            script_input2.value,
                          )
                        }
                        _ -> fail @"Invalid input script datum"
                      }
                    }

                    _ -> fail @"Too many script inputs"
                  }

                expect GlobalLockState {
                  locked_tuna: out_locked_tuna,
                  lock_state_type: out_lock_state_type,
                }: ForkDatum = out_lock_datum

                and {
                  // Fork Lock(5) requirement: Lock state output has correct miner readiness
                  when in_lock_state_type is {
                    Miner(in_miner_signal) -> {
                      expect Miner(out_miner_signal) = out_lock_state_type

                      expect Some(fortuna_v1_input_ref) = fortuna_v1_input_ref
                      //
                      let fortuna_input =
                        utils.resolve_output_reference(
                          inputs,
                          fortuna_v1_input_ref,
                        )

                      and {
                        quantity_of(
                          fortuna_input.value,
                          fortuna_v1_hash,
                          fortuna.master_token_name,
                        ) == 1,
                        // TODO: fix miner signal to be a calculation
                        in_miner_signal == out_miner_signal,
                      }
                    }
                    Regular -> Regular == out_lock_state_type
                  },
                  // Fork Lock(6) requirement: Lock state output has correct locked tuna
                  in_locked_tuna + out_tuna_quantity - prev_held_amount == out_locked_tuna,
                  // Fork Lock(7) requirement: Lock state output has same value
                  value.without_lovelace(in_state_value) == value.without_lovelace(
                    lock_output.value,
                  ),
                }
              }

              // In a hard forked state, we reference the miner lock state and modify the regular lock state
              // We also now ensure the total regular locked amount + miner locked amount can't exceed the `emitted amount`
              // The emitted amount is based on hard fork block height
              // By doing this we prevent users from locking more tokens than the emitted amount
              // A user technically could still send to the address, but would be unable to mint the nft key that is essential to burn in order to redeem
              // Thus any nft key that exists is proof that those locked funds were accounted for in the lock state already
              // Miner lock state can't be modified anymore
              Forked -> {
                let own_address =
                  Address {
                    payment_credential: ScriptCredential(own_policy),
                    stake_credential: None,
                  }

                let script_inputs =
                  utils.filter_resolved_inputs(
                    inputs,
                    fn(input) { input.output.address == own_address },
                  )

                // validate nft state output
                let nft_output = list_at(outputs, nft_output_index)
                //
                expect InlineDatum(nft_datum) = nft_output.datum
                //
                expect NftState { nft_key: out_nft_key }: ForkDatum = nft_datum

                let out_tuna_quantity =
                  nft_output.value
                    |> quantity_of(fortuna_v1_hash, fortuna.token_name)

                // validate lock state output
                let lock_output = list_at(outputs, lock_output_index)

                expect InlineDatum(out_lock_datum) = lock_output.datum

                todo
              }
              FailedFork -> False
            }
          }
          // We allow unlocking of fortuna v1 tokens in the case of a failed fork
          // We only allow an input to be spent under the hard fork failed condition and when burning the nft key
          Unlock { hard_fork_state_ref } -> {
            let mint = value.from_minted_value(mint)

            let hfs_input =
              utils.resolve_output_reference(
                reference_inputs,
                hard_fork_state_ref,
              )

            let own_address =
              Address {
                payment_credential: ScriptCredential(own_policy),
                stake_credential: None,
              }

            // Can only unlock one input at a time 
            expect [locked_v1_input] =
              utils.filter_resolved_inputs(
                inputs,
                fn(input) { input.output.address == own_address },
              )

            let Output { datum: hfs_datum, value: hfs_value, .. } = hfs_input

            expect InlineDatum(hfs_datum) = hfs_datum
            expect HardForkState { status: FailedFork, .. }: ForkDatum =
              hfs_datum

            let Output { datum: nft_state, .. } = locked_v1_input

            expect InlineDatum(nft_state) = nft_state

            expect NftState { nft_key }: ForkDatum = nft_state

            expect [(token_name, -1)] =
              mint |> tokens(own_policy) |> dict.to_list

            and {
              quantity_of(hfs_value, own_policy, hard_fork_state_token) == 1,
              token_name == nft_key,
            }
          }

          _ -> False
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
