use aiken/builtin
use aiken/dict
use aiken/list
use aiken/pairs
use aiken/transaction.{
  InlineDatum, Input, Output, OutputReference, ScriptContext, Transaction,
} as tx
use aiken/transaction/credential.{Address, Inline, ScriptCredential}
use aiken/transaction/value
use fortuna
use fortuna/types.{State}
use fortuna/utils
use fortunav2.{quantity_of}
use hardfork
use hardfork/hftypes.{HardFork, Lock, NftForkAction}
use hardfork/params.{lock_state_token}

/// Simplified fork with only 2 actions. HardFork current tuna v1 version to v2 version
/// and Lock action to lock v1 tokens and mint v2 tokens. This is simpler version that does not have miners'
/// input in the hardfork action. This is mainly because there are no current miners anyway.
/// Ensures that maximum lockable tuna is equal to emitted tuna at block height
type LockState {
  block_height: Int,
  current_locked_tuna: Int,
}

/// The reason this is a withdraw based validator is for the ease of grabbing the redeemer
/// using the tunav2 validator.
validator(init_utxo_ref: OutputReference, fortuna_v1_hash: ByteArray) {
  fn nft_fork(redeemer: Data<NftForkAction>, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, purpose } = ctx

    when purpose is {
      tx.Mint(own_policy) -> {
        let Transaction { withdrawals, .. } = transaction

        let own_withdrawal = Inline(ScriptCredential(own_policy))

        // Fork Mint(0) requirement: Withdrawal script is present
        pairs.has_key(withdrawals, own_withdrawal)
      }

      tx.WithdrawFrom(stake_cred) -> {
        expect action: NftForkAction = redeemer

        expect Inline(ScriptCredential(own_policy)) = stake_cred

        when action is {
          HardFork { lock_output_index } -> {
            let Transaction { inputs, reference_inputs, outputs, mint, .. } =
              transaction

            // Step 1: Pull out script context information to validate on
            // This include inputs, reference inputs, outputs, and minted tokens
            let Output { address, datum, value, .. } =
              utils.list_at(outputs, lock_output_index)

            expect Some(_) =
              list.find(
                inputs,
                fn(input) { input.output_reference == init_utxo_ref },
              )

            expect Some(v1_miner_ref) = {
              let input <- list.find(reference_inputs)
              input.output.value
                |> value.to_dict
                |> dict.to_pairs
                |> quantity_of(fortuna_v1_hash, fortuna.master_token_name)
                |> builtin.equals_integer(1)
            }

            expect [Pair(_, 1)] =
              mint
                |> value.from_minted_value
                |> value.tokens(own_policy)
                |> dict.to_pairs

            // Step 2: Extract input state from inputs
            // In this case only block_number from v1_miner_ref is needed
            expect State { block_number, .. }: State =
              v1_miner_ref.output.datum |> utils.get_inline_datum

            // Step 3: Created expected output state
            let expected_lock_state =
              InlineDatum(
                LockState { block_height: block_number, current_locked_tuna: 0 },
              )

            let expected_lock_value =
              value.from_asset(own_policy, lock_state_token, 1)

            // Step 4: Validate that the transitioning states are correct
            and {
              // Validate output state
              address == Address(ScriptCredential(own_policy), None),
              datum == expected_lock_state,
              value
                |> value.without_lovelace
                |> builtin.equals_data(expected_lock_value),
            }
          }

          Lock { lock_output_index, locking_amount } -> {
            let Transaction { inputs, outputs, mint, .. } = transaction

            // Validate no tokens are minted
            expect [] =
              mint
                |> value.from_minted_value
                |> value.tokens(own_policy)
                |> dict.to_pairs

            let own_address = Address(ScriptCredential(own_policy), None)

            // Validate only a single input is used
            // i.e. the state input
            expect [Input(_, Output(in_address, in_lock_value, in_datum, _))] =
              list.filter(
                inputs,
                fn(input) { input.output.address == own_address },
              )

            // grab output from specified index
            let Output(out_address, out_value, out_datum, _) =
              utils.list_at(outputs, lock_output_index)

            let v1_tuna_amount =
              out_value
                |> value.to_dict
                |> dict.to_pairs
                |> quantity_of(fortuna_v1_hash, fortuna.token_name)

            let expected_lock_value =
              value.from_asset(own_policy, lock_state_token, 1)
                |> value.add(fortuna_v1_hash, fortuna.token_name, v1_tuna_amount)

            expect LockState { block_height, current_locked_tuna }: LockState =
              in_datum |> utils.get_inline_datum

            expect LockState(out_block_height, new_locked_tuna): LockState =
              out_datum |> utils.get_inline_datum

            let total_forked_emission =
              hardfork.calculate_emission(block_height)

            and {
              // Validate output state
              in_address == out_address,
              // Validate input value
              in_lock_value
                |> value.to_dict
                |> dict.to_pairs
                |> quantity_of(own_policy, lock_state_token)
                |> builtin.equals_integer(1),
              // Validate output value
              out_value
                |> value.without_lovelace
                |> builtin.equals_data(expected_lock_value),
              new_locked_tuna == v1_tuna_amount,
              block_height == out_block_height,
              new_locked_tuna <= total_forked_emission,
              locking_amount == new_locked_tuna - current_locked_tuna,
            }
          }
        }
      }

      _ -> False
    }
  }

  fn fork(
    _datum: Data<LockState>,
    _redeemer: Data<Int>,
    ctx: ScriptContext,
  ) -> Bool {
    let ScriptContext { transaction, purpose } = ctx

    expect tx.Spend(own_ref) = purpose

    let Transaction { inputs, withdrawals, .. } = transaction

    let own_input = utils.resolve_output_reference(inputs, own_ref)

    let own_withdrawal = Inline(own_input.address.payment_credential)

    // Fork Spend(0) requirement: Withdrawal script is present
    pairs.has_key(withdrawals, own_withdrawal)
  }
}
