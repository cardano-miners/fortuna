use aiken/alist
use aiken/builtin
use aiken/bytearray
use aiken/dict
use aiken/hash.{blake2b_256, sha2_256}
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/list
use aiken/math.{pow2}
use aiken/sparse_merkle_tree.{verify_added_member}
use aiken/sparse_merkle_tree/merkle.{
  Side, convert_bytes_to_left_proofs, convert_bytes_to_remainder_proofs,
  convert_bytes_to_right_proofs,
}
use aiken/transaction.{
  Mint, Output, OutputReference, ScriptContext, Spend, Transaction,
} as tx
use aiken/transaction/credential.{Inline, ScriptCredential}
use aiken/transaction/value.{from_minted_value, tokens}
use fortuna
use fortuna/parameters.{epoch_number, halving_number, initial_payout}
use fortuna/types.{Statev2}
use fortuna/utils.{
  get_inline_datum, integer_to_bytes, list_at, quantity_of,
  resolve_output_reference,
}
use fortunav2.{genesis_v2}
use hardfork/hftypes.{Lock, NftForkAction}

type TunaAction {
  Genesis
  MineTuna(OutputReference, Int, Int)
  Redeem
  NominateUpgradeToken
  BurnUpgradeToken
  ApplyUpgradeToken
}

type TunaSpendAction {
  TokenVoteFor
  TokenVoteAgainst
  MinerVoteFor
}

type MerkleProofBlock {
  starting_side: Side,
  left_proofs: ByteArray,
  right_proofs: ByteArray,
  remaining_side_proofs: ByteArray,
  remaining_proofs: ByteArray,
}

type Miner {
  Pkh(ByteArray, Data)
  Nft { policy: ByteArray, name: ByteArray, output_index: Int, extra: Data }
}

type MineAction {
  Mine(ByteArray, Miner, MerkleProofBlock)
  Upgrade(OutputReference)
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

validator(fortuna_v1_hash: ByteArray, fork_script_hash: ByteArray) {
  fn tuna(redeemer: TunaAction, ctx: ScriptContext) -> Bool {
    expect ScriptContext { transaction: tx, purpose: Mint(own_policy) } = ctx

    when redeemer is {
      Genesis -> genesis_v2(tx, own_policy, fortuna_v1_hash, fork_script_hash)

      Redeem -> {
        let Transaction { mint, redeemers, .. } = tx

        let withdraw_purpose =
          tx.WithdrawFrom(Inline(ScriptCredential(fork_script_hash)))

        expect Some(lock_rdmr) = alist.get_first(redeemers, withdraw_purpose)

        expect Lock { locking_amount, .. }: NftForkAction = lock_rdmr

        expect [Pair(mint_name, mint_amount)] =
          mint
            |> value.from_minted_value
            |> value.tokens(own_policy)
            |> dict.to_alist

        and {
          mint_name == fortuna.token_name,
          mint_amount == locking_amount,
          mint_amount > 0,
        }
      }

      MineTuna(input_ref, block_number, output_index) -> {
        let Transaction { inputs, mint, outputs, .. } = tx

        expect [
          Pair(tuna_name, tuna_quantity),
          Pair(minted_name1, minted_quantity1),
          Pair(minted_name2, minted_quantity2),
        ] =
          mint |> from_minted_value |> value.tokens(own_policy) |> dict.to_alist

        let Output { address: spend_address, value: spend_value, .. } =
          resolve_output_reference(inputs, input_ref)

        expect ScriptCredential(spend_cred) = spend_address.payment_credential

        let big_tuna_name =
          bytearray.concat(fortunav2.big_tuna_prefix, spend_cred)

        expect [Pair(token1, 1), Pair(token2, 1)] =
          spend_value |> value.tokens(own_policy) |> dict.to_alist

        let in_token_name =
          // By ledger rules we should only hit this first if since token names
          // are lexographically sorted
          if token2 == big_tuna_name {
            token1
          } else if token1 == big_tuna_name {
            token2
          } else {
            fail @"Big Tuna not found in input value"
          }

        let expected_in_token_name = integer_to_bytes(block_number, "")

        let expected_out_token_name = integer_to_bytes(block_number + 1, "")

        let expect_out_value =
          value.from_asset(own_policy, big_tuna_name, 1)
            |> value.add(own_policy, expected_out_token_name, 1)

        let Output { address: out_address, value: out_value, .. } =
          list_at(outputs, output_index)

        let halving_exponent = block_number / halving_number

        let expected_quantity =
          if halving_exponent > 32 {
            0
          } else {
            initial_payout / pow2(halving_exponent)
          }

        and {
          //address check
          spend_address == out_address,
          // input value check
          in_token_name == expected_in_token_name,
          // output value check
          out_value
            |> value.without_lovelace
            |> builtin.equals_data(expect_out_value),
          // minted counter check
          or {
            and {
              minted_name1 == expected_in_token_name,
              minted_quantity1 == -1,
              minted_name2 == expected_out_token_name,
              minted_quantity2 == 1,
            },
            and {
              minted_name1 == expected_out_token_name,
              minted_quantity1 == 1,
              minted_name2 == expected_in_token_name,
              minted_quantity2 == -1,
            },
          },
          // minted tuna check
          tuna_name == fortuna.token_name,
          tuna_quantity == expected_quantity,
        }
      }

      NominateUpgradeToken -> todo
      BurnUpgradeToken -> todo
      ApplyUpgradeToken -> todo
    }
  }

  fn govern(_dat, rdmr: TunaSpendAction, _ctx: ScriptContext) -> Bool {
    when rdmr is {
      TokenVoteFor -> todo
      TokenVoteAgainst -> todo
      MinerVoteFor -> todo
    }
  }
}

validator(tunav2_minting_policy: ByteArray) {
  fn mine(datum: Statev2, redeemer: MineAction, ctx: ScriptContext) -> Bool {
    when redeemer is {
      Mine(nonce, miner, merkle_proof_block) -> {
        let Statev2 {
          block_number,
          current_hash,
          leading_zeros,
          target_number,
          epoch_time,
          current_posix_time,
          merkle_root,
        } = datum

        let ScriptContext { transaction, purpose } = ctx

        expect Spend(own_reference) = purpose

        let Transaction { inputs, outputs, mint, validity_range, .. } =
          transaction

        let mint = value.from_minted_value(mint)

        let own_input = resolve_output_reference(inputs, own_reference)

        let Output { address: in_address, value: in_value, .. } = own_input

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

        // Spend(5) requirement: Only one type of token minted under the validator policy
        expect [Pair(token_name, quantity)] =
          mint
            |> tokens(tunav2_minting_policy)
            |> dict.to_alist

        let halving_exponent = block_number / halving_number

        let expected_quantity =
          // This should be 32 not 29
          if halving_exponent > 32 {
            0
          } else {
            initial_payout / math.pow2(halving_exponent)
          }

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

        // Spend(9) requirement: Check output has correct difficulty number, leading zeros, and epoch time
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
                target_number,
                leading_zeros,
                adjustment_numerator,
                adjustment_denominator,
              )

            and {
              (new_leading_zeroes == out_leading_zeros)?,
              (new_difficulty == out_target_number)?,
              (0 == out_epoch_time)?,
            }
          } else {
            let new_epoch_time =
              epoch_time + averaged_current_time - current_posix_time

            and {
              (leading_zeros == out_leading_zeros)?,
              (target_number == out_target_number)?,
              (new_epoch_time == out_epoch_time)?,
            }
          }

        // For variance in the merkle tree we swap the last 7 bytes with the first 25 bytes
        let new_merkle_member =
          builtin.slice_bytearray(25, 32, found_bytearray)
            |> bytearray.concat(bytearray.take(found_bytearray, 25))

        let MerkleProofBlock {
          starting_side,
          left_proofs,
          right_proofs,
          remaining_side_proofs,
          remaining_proofs,
        } = merkle_proof_block

        and {
          // Posix time is in milliseconds
          // Spend(1) requirement: Time range span is 3 minutes or less and inclusive
          !upper_is_inclusive?,
          lower_is_inclusive?,
          (upper_range - lower_range <= 180000)?,
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
                  |> quantity_of(nft_policy, nft_name)

              quantity == 1
            }
          },
          // Mining Difficulty Met
          // Spend(3) requirement: Found difficulty is less than or equal to the current difficulty
          // We do this by checking the leading zeros and the difficulty number
          or {
            (found_leading_zeros > leading_zeros)?,
            and {
              (found_leading_zeros == leading_zeros)?,
              (found_target_number < target_number)?,
            },
          },
          // Spend(4) requirement: Input has master token
          (quantity_of(
            in_value,
            tunav2_minting_policy,
            fortuna.master_token_name,
          ) == 1)?,
          // Spend(6) requirement: Minted token is the correct name and amount
          (token_name == fortuna.token_name)?,
          (quantity == expected_quantity)?,
          // Spend(7) requirement: Output has only master token and ada
          fortuna.value_has_only_master_and_lovelace(
            out_value,
            tunav2_minting_policy,
          )?,
          // Spend(10) requirement: Output posix time is the averaged current time
          (out_current_posix_time == averaged_current_time)?,
          // Spend(11) requirement: Output block number is the input block number + 1 
          (block_number + 1 == out_block_number)?,
          // Spend(12) requirement: Output current hash is the found hash
          (out_current_hash == found_bytearray)?,
          // Spend(13) requirement: Check output merkle is correct
          verify_added_member(
            new_merkle_member,
            starting_side,
            left_proofs |> convert_bytes_to_left_proofs,
            right_proofs |> convert_bytes_to_right_proofs,
            remaining_side_proofs,
            remaining_proofs |> convert_bytes_to_remainder_proofs,
            merkle_root,
            out_merkle,
          ),
        }
      }

      Upgrade(_ref_input) -> todo
    }
  }
}
