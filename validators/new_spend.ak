use aiken/builtin
use aiken/bytearray
use aiken/dict
use aiken/hash.{blake2b_256, sha2_256}
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/list
use aiken/merkle_patricia_forestry.{Proof, from_root, insert}
use aiken/transaction.{
  Mint, Output, OutputReference, ScriptContext, Spend, Transaction,
}
use aiken/transaction/credential.{ScriptCredential}
use aiken/transaction/value
use fortuna
use fortuna/parameters.{epoch_number}
use fortuna/types.{FinalizeNomination, Statev2, TunaAction}
use fortuna/utils.{get_inline_datum, integer_to_bytes, resolve_output_reference}
use fortunav2.{expect_first, quantity_of}

type Miner {
  Pkh(ByteArray, Data)
  Nft { policy: ByteArray, name: ByteArray, output_index: Int, extra: Data }
}

type MineAction {
  MinePow(ByteArray, Miner, Proof)
  Upgrade
  Nominate
}

type TargetState {
  nonce: ByteArray,
  miner: ByteArray,
  epoch_time: Int,
  block_number: Int,
  current_hash: ByteArray,
  leading_zeros: Int,
  target_number: Int,
}

validator(tunav2_minting_policy: ByteArray, init_utxo_ref: OutputReference) {
  fn mine(datum: Data, redeemer: MineAction, ctx: ScriptContext) -> Bool {
    when redeemer is {
      MinePow(nonce, miner, merkle_proof_list) -> {
        expect Statev2 {
          block_number,
          current_hash,
          leading_zeros,
          target_number,
          epoch_time,
          current_posix_time,
          merkle_root,
        }: Statev2 = datum

        let ScriptContext { transaction, purpose } = ctx

        expect Spend(own_reference) = purpose

        let Transaction { inputs, outputs, validity_range, .. } = transaction

        let Output { address: in_address, value: in_value, .. } =
          resolve_output_reference(inputs, own_reference)

        expect ScriptCredential(own_script_hash) = in_address.payment_credential

        // Spend(0) requirement: Contract has only one output with the master token going back to itself
        expect Some(own_output) =
          list.find(
            outputs,
            fn(output: Output) { output.address == in_address },
          )

        let Output { datum: out_datum, value: out_value, .. } = own_output

        // Time Range Span is 3 minutes or less 
        // We have a constant expectation of the transaction time range
        expect Interval {
          upper_bound: IntervalBound {
            bound_type: Finite(upper_range),
            is_inclusive: upper_is_inclusive,
          },
          lower_bound: IntervalBound {
            bound_type: Finite(lower_range),
            is_inclusive: lower_is_inclusive,
          },
        } = validity_range

        let averaged_current_time =
          ( upper_range - lower_range ) / 2 + lower_range

        // Target state now includes a miner credential
        let target =
          TargetState {
            nonce,
            block_number,
            epoch_time,
            current_hash,
            leading_zeros,
            target_number,
            miner: blake2b_256(builtin.serialise_data(miner)),
          }

        let found_bytearray =
          target
            |> builtin.serialise_data()
            |> sha2_256()
            |> sha2_256()

        let (found_target_number, found_leading_zeros) =
          fortuna.format_found_bytearray(found_bytearray)

        // Check output datum contains correct epoch time, block number, hash, and leading zeros
        // Check for every divisible by 2016 block: 
        // - Epoch time resets
        // - leading zeros is adjusted based on percent of hardcoded target time for 2016 blocks vs epoch time
        // Spend(8) requirement: Expect Output Datum to be of type Statev2
        expect Statev2 {
          epoch_time: out_epoch_time,
          block_number: out_block_number,
          current_hash: out_current_hash,
          leading_zeros: out_leading_zeros,
          target_number: out_target_number,
          current_posix_time: out_current_posix_time,
          merkle_root: out_merkle,
        }: Statev2 = get_inline_datum(out_datum)

        let block_number_as_bytes = integer_to_bytes(out_block_number, "")

        let expected_output_value =
          value.from_asset(
            tunav2_minting_policy,
            bytearray.concat(fortunav2.big_tuna_prefix, own_script_hash),
            1,
          )
            |> value.add(
                tunav2_minting_policy,
                bytearray.concat(
                  fortunav2.counter_prefix,
                  block_number_as_bytes,
                ),
                1,
              )

        and {
          // Posix time is in milliseconds
          // Spend(1) requirement: Time range span is 3 minutes or less and inclusive
          !upper_is_inclusive,
          lower_is_inclusive,
          upper_range - lower_range <= 180000,
          // In case you are wondering here is what enables pools
          // A miner can be a pkh or an nft
          // Nfts can come from any input, even validators
          // So any validator logic can be enforced to run along with fortuna
          // Spend(2) requirement: Validate miner is made the tx
          when miner is {
            Pkh(signer, _) -> list.has(transaction.extra_signatories, signer)
            Nft { policy: nft_policy, name: nft_name, output_index, .. } -> {
              let quantity =
                utils.list_at(outputs, output_index).value
                  |> value.to_dict
                  |> dict.to_pairs
                  |> quantity_of(nft_policy, nft_name)

              quantity == 1
            }
          },
          // Mining Difficulty Met
          // Spend(3) requirement: Found difficulty is less than or equal to the current difficulty
          // We do this by checking the leading zeros and the difficulty number
          or {
            found_leading_zeros > leading_zeros,
            and {
              found_leading_zeros == leading_zeros,
              found_target_number < target_number,
            },
          },
          // Spend(4) requirement: Input has master token
          quantity_of(
            in_value |> value.to_dict |> dict.to_pairs,
            tunav2_minting_policy,
            bytearray.concat(fortunav2.big_tuna_prefix, own_script_hash),
          ) == 1,
          // Spend(7) requirement: Output has same tokens as input
          expected_output_value == value.without_lovelace(out_value),
          // Spend(9) requirement: Check output has correct difficulty number, leading zeros, and epoch time
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

            and {
              new_leading_zeroes == out_leading_zeros,
              new_difficulty == out_target_number,
              0 == out_epoch_time,
            }
          } else {
            let new_epoch_time =
              epoch_time + averaged_current_time - current_posix_time

            and {
              leading_zeros == out_leading_zeros,
              target_number == out_target_number,
              new_epoch_time == out_epoch_time,
            }
          },
          // Spend(10) requirement: Output posix time is the averaged current time
          out_current_posix_time == averaged_current_time,
          // Spend(11) requirement: Output block number is the input block number + 1 
          block_number + 1 == out_block_number,
          // Spend(12) requirement: Output current hash is the found hash
          out_current_hash == found_bytearray,
          // Spend(13) requirement: Check output merkle is correct
          insert(
            merkle_root |> from_root,
            found_bytearray |> blake2b_256,
            found_bytearray,
            merkle_proof_list,
          ) == from_root(out_merkle),
          // Spend(14) requirement: Data size doesn't exceed 1/4 tx size
          builtin.serialise_data(miner)
            |> builtin.length_of_bytearray()
            |> builtin.less_than_equals_integer(4096),
        }
      }

      Upgrade -> {
        let Transaction { redeemers, .. } = ctx.transaction

        let upgrade_rdmr = expect_first(redeemers, Mint(tunav2_minting_policy))

        expect FinalizeNomination { .. }: TunaAction = upgrade_rdmr

        True
      }

      Nominate ->
        list.any(
          ctx.transaction.inputs,
          fn(input) { input.output_reference == init_utxo_ref },
        )
    }
  }
}
