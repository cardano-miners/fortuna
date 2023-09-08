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
use fortuna.{master_token_name, token_name}
use fortuna/parameters.{epoch_number, halving_number, initial_payout}
use fortuna/types.{State}
use fortuna/utils.{list_at, quantity_of}

type TunaAction {
  Genesis
  Mine
  Redeem
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

validator(init_utxo_ref: OutputReference, fork_hash: ByteArray) {
  fn tuna(redeemer: TunaAction, ctx: ScriptContext) -> Bool {
    when redeemer is {
      Genesis -> {
        // This time genesis mints "lord tuna" and hands it over to the hard fork contract
        // Then after the hard fork "lord tuna" is handed over to this miner contract
        // This allows us to maintain the miner contract with the same logic as the old one
        let _x = 1
        todo
      }
      Mine -> {
        expect ScriptContext { transaction: tx, purpose: Mint(own_policy) } =
          ctx

        let own_credential = ScriptCredential(own_policy)
        let own_address =
          Address { payment_credential: own_credential, stake_credential: None }

        // Mint(0) Mine requirement: Contract has one spend input with the policy as the payment credential
        list.any(tx.inputs, fn(input) { input.output.address == own_address })?
      }
      Redeem -> todo
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
      found_difficulty_number,
      difficulty_number,
      leading_zeros,
    ) == out_interlink)?
  }
}

type HardForkStatus {
  NotForked
  Forked
  FailedFork
}

type ForkDatum {
  HardForkState { status: HardForkStatus, fortuna_v1_height: Int }
  MinerGlobalLockState { miner_locked_tuna: Int }
  GlobalLockState { locked_tuna: Int }
  NftState { nft_key: ByteArray }
}

type KeyInput {
  key: ByteArray,
  input: OutputReference,
}

type LockActionType {
  MinerLock(OutputReference)
  NormalLock
  AfterForkLock(OutputReference)
}

type NftForkAction {
  Initialize
  Lock {
    hard_fork_state_ref: OutputReference,
    key: Option<KeyInput>,
    lock_state_ref: OutputReference,
    lock_type: LockActionType,
    lock_output_index: Int,
    nft_output_index: Int,
  }
  HardFork
  Unlock
  Burn
}

const miner_lock_state_token: ByteArray = "miner_lock_state"

const lock_state_token: ByteArray = "lock_state"

const hard_fork_state_token: ByteArray = "hfs"

// maybe we should do time instead of block height?
validator(
  init_utxo_ref: OutputReference,
  fortuna_v1_hash: ByteArray,
  block_height: Int,
) {
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
          Initialize -> todo
          Lock {
            hard_fork_state_ref,
            key,
            nft_output_index,
            lock_output_index,
            lock_type,
            lock_state_ref,
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
                let (nft_owner_key, prev_held_amount) =
                  // Validate nft key is present or minted
                  when key is {
                    None -> {
                      // validate mint
                      // Use blake hash since it's faster and this is unrelated to Proof of Work
                      let own_token_name =
                        builtin.head_list(inputs).output_reference
                          |> builtin.serialise_data
                          |> hash.blake2b_256

                      expect [(mint_token_name, 1)] =
                        mint
                          |> value.from_minted_value
                          |> value.tokens(own_policy)
                          |> dict.to_list

                      // Fork Lock(0) requirement: Minted token name is derived from the input ref
                      expect own_token_name == mint_token_name
                      //
                      (own_token_name, 0)
                    }
                    Some(_) -> todo
                  }

                // validate nft state output
                let nft_output = list_at(outputs, nft_output_index)

                expect InlineDatum(nft_datum) = nft_output.datum

                expect NftState { nft_key }: ForkDatum = nft_datum

                // Fork Lock(1) requirement: NFT key is the same as the owner key at the output
                expect nft_key == nft_owner_key
                //
                let tuna_quantity =
                  nft_output.value
                    |> quantity_of(fortuna_v1_hash, token_name)

                // Fork Lock(2) requirement: Tuna quantity is greater than the previous held amount
                expect tuna_quantity > prev_held_amount
                //
                // validate lock state output
                let lock_output = list_at(outputs, lock_output_index)

                expect InlineDatum(out_lock_datum) = lock_output.datum

                let lock_input =
                  utils.resolve_output_reference(inputs, lock_state_ref)

                when lock_type is {
                  // In miner lock we also check for the presence of the fortuna v1 script
                  MinerLock(fortuna_v1_input_ref) -> {
                    expect
                      utils.value_has_nft_and_lovelace(
                        lock_input.value,
                        own_policy,
                        miner_lock_state_token,
                      )
                    //
                    expect
                      utils.value_has_nft_and_lovelace(
                        lock_output.value,
                        own_policy,
                        miner_lock_state_token,
                      )
                    //
                    expect InlineDatum(datum) = lock_input.datum

                    expect MinerGlobalLockState { miner_locked_tuna }: ForkDatum =
                      datum

                    expect MinerGlobalLockState {
                      miner_locked_tuna: out_miner_locked_tuna,
                    }: ForkDatum = out_lock_datum

                    let tuna_v1_input =
                      utils.resolve_output_reference(
                        inputs,
                        fortuna_v1_input_ref,
                      )

                    expect
                      quantity_of(
                        tuna_v1_input.value,
                        fortuna_v1_hash,
                        master_token_name,
                      ) == 1
                    //
                    miner_locked_tuna + tuna_quantity - prev_held_amount == out_miner_locked_tuna
                  }
                  NormalLock -> {
                    expect
                      utils.value_has_nft_and_lovelace(
                        lock_input.value,
                        own_policy,
                        lock_state_token,
                      )
                    //
                    expect
                      utils.value_has_nft_and_lovelace(
                        lock_output.value,
                        own_policy,
                        lock_state_token,
                      )
                    //
                    expect InlineDatum(datum) = lock_input.datum

                    expect GlobalLockState { locked_tuna }: ForkDatum = datum

                    expect GlobalLockState { locked_tuna: out_locked_tuna }: ForkDatum =
                      out_lock_datum

                    locked_tuna + tuna_quantity - prev_held_amount == out_locked_tuna
                  }
                  _ -> todo
                }
              }
              Forked -> todo
              FailedFork -> False
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
