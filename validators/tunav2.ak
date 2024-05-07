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
  InlineDatum, Mint, Output, OutputReference, ScriptContext, Spend, Transaction,
} as tx
use aiken/transaction/credential.{Inline, ScriptCredential}
use aiken/transaction/value.{from_minted_value}
use fortuna
use fortuna/parameters.{epoch_number, halving_number, initial_payout}
use fortuna/types.{Statev2}
use fortuna/utils.{
  get_inline_datum, integer_to_bytes, quantity_of, resolve_output_reference,
}
use fortunav2.{flip_hash, genesis_v2, voting_period}
use hardfork/hftypes.{Lock, NftForkAction}

type TunaAction {
  Genesis
  MineTuna(OutputReference, Int)
  Redeem
  NominateUpgrade(ByteArray, Int)
  VotingToken(OutputReference)
  BurnToken
  FinalizeNomination
}

type TunaSpendAction {
  TokenVoteFor
  TokenVoteAgainst
  MinerVoteFor
  TransitionState
}

type TunaUpgradeProcess {
  Nominated {
    script_hash: ByteArray,
    for_count: Int,
    anti_script_hash: ByteArray,
    against_count: Int,
    deadline: Int,
  }
  Mining {
    script_hash: ByteArray,
    miner_support_count: Int,
    block_height_deadline: Int,
  }
}

type Miner {
  Pkh(ByteArray, Data)
  Nft { policy: ByteArray, name: ByteArray, output_index: Int, extra: Data }
}

type MerkleProofBlock {
  starting_side: Side,
  left_proofs: ByteArray,
  right_proofs: ByteArray,
  remaining_side_proofs: ByteArray,
  remaining_proofs: ByteArray,
}

type MineAction {
  MinePow(ByteArray, Miner, MerkleProofBlock)
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

validator(fortuna_v1_hash: Data, fork_script_hash: Data) {
  fn tuna(redeemer: TunaAction, ctx: ScriptContext) -> Bool {
    expect ScriptContext { transaction: tx, purpose: Mint(own_policy) } = ctx

    when redeemer is {
      Genesis -> genesis_v2(tx, own_policy, fortuna_v1_hash, fork_script_hash)

      Redeem -> {
        let Transaction { mint, redeemers, .. } = tx

        expect fork_script_hash: ByteArray = fork_script_hash

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

      MineTuna(input_ref, block_number) -> {
        let Transaction { inputs, mint, .. } = tx

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

        let halving_exponent = block_number / halving_number

        let expected_quantity =
          if halving_exponent > 32 {
            0
          } else {
            initial_payout / pow2(halving_exponent)
          }

        // We don't check the output because we expect the spend script to take care of 
        // transporting the tokens to the next output
        // As a backup in case of a spend script exploit, we still check
        // that the input has the correct 2 tokens (Lord Tuna and counter) and the payment credential is contained 
        // within the Lord Tuna token name.
        and {
          // input value check
          in_token_name == expected_in_token_name,
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

      NominateUpgrade(script_hash, output_index) -> {
        let Transaction { mint, outputs, withdrawals, validity_range, .. } = tx

        // Check contract is executable
        expect Some(_) =
          alist.get_first(withdrawals, Inline(ScriptCredential(script_hash)))

        // Mint nomination token
        expect [Pair(nominated_contract_token, 1)] =
          mint |> from_minted_value |> value.tokens(own_policy) |> dict.to_alist

        let expected_value =
          value.from_asset(own_policy, nominated_contract_token, 1)

        let anti_script_hash = flip_hash(script_hash)

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

        let expected_datum =
          InlineDatum(
            Nominated {
              script_hash,
              for_count: 0,
              anti_script_hash,
              against_count: 0,
              deadline: lower_range + voting_period(),
            },
          )

        let Output {
          address,
          value: nominated_value,
          datum: nominated_datum,
          ..
        } = utils.list_at(outputs, output_index)

        and {
          nominated_contract_token == bytearray.concat(
            fortunav2.nominated_prefix,
            script_hash,
          ),
          address.payment_credential == ScriptCredential(own_policy),
          expected_value == value.without_lovelace(nominated_value),
          expected_datum == nominated_datum,
          !upper_is_inclusive?,
          lower_is_inclusive?,
          (upper_range - lower_range <= 180000)?,
        }
      }

      VotingToken(ref_input) -> {
        let Transaction { reference_inputs, mint, .. } = tx

        let Output {
          address: spend_address,
          value: spend_value,
          datum: spend_datum,
          ..
        } = resolve_output_reference(reference_inputs, ref_input)

        expect Nominated { script_hash, anti_script_hash, .. }: TunaUpgradeProcess =
          get_inline_datum(spend_datum)

        expect [Pair(voting_token, 1)] =
          mint |> from_minted_value |> value.tokens(own_policy) |> dict.to_alist

        and {
          // Is from this contract
          spend_address.payment_credential == ScriptCredential(own_policy),
          // Has NFT for the nominated contract
          value.quantity_of(
            spend_value,
            own_policy,
            bytearray.concat(fortunav2.nominated_prefix, script_hash),
          ) == 1,
          or {
            // Is for the nominated contract
            voting_token == script_hash,
            // Is against the nominated contract
            voting_token == anti_script_hash,
          },
        }
      }

      BurnToken -> {
        let Transaction { mint, .. } = tx

        mint
          |> from_minted_value
          |> value.tokens(own_policy)
          |> dict.to_alist
          |> list.all(
              fn(pair) {
                let Pair(_, quantity) = pair
                quantity < 0
              },
            )
      }

      FinalizeNomination -> todo
    }
  }

  fn govern(_dat, rdmr: TunaSpendAction, _ctx: ScriptContext) -> Bool {
    when rdmr is {
      TokenVoteFor -> todo
      TokenVoteAgainst -> todo
      MinerVoteFor -> todo
      TransitionState -> todo
    }
  }
}

validator(tunav2_minting_policy: ByteArray) {
  fn mine(datum: Statev2, redeemer: MineAction, ctx: ScriptContext) -> Bool {
    when redeemer is {
      MinePow(nonce, miner, merkle_proof_block) -> {
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
          }?,
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
            bytearray.concat(fortunav2.big_tuna_prefix, own_script_hash),
          ) == 1)?,
          // Spend(7) requirement: Output has same tokens as input
          (value.without_lovelace(in_value) == value.without_lovelace(out_value))?,
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
          )?,
        }
      }

      Upgrade(_ref_input) -> todo
    }
  }
}
