use aiken/builtin
use aiken/dict
use aiken/list
use aiken/transaction.{
  InlineDatum, Output, OutputReference, ScriptContext, Transaction,
} as tx
use aiken/transaction/credential.{Address, Inline, ScriptCredential}
use aiken/transaction/value
use fortuna
use fortuna/types.{ExtraState, MineState, State, Statev2}
use fortuna/utils
use hardfork/params.{
  hard_fork_merkle_root, hardfork_block_height, lock_state_token,
}

/// Simplified fork with only 2 actions. HardFork current tuna v1 version to v2 version
/// and Lock action to lock v1 tokens and mint v2 tokens. This is simpler version that does not have miners'
/// input in the hardfork action. This is mainly because there are no current miners anyway.
type NftForkAction {
  /// This action is only run once and it sets up the ability to convert v1 tuna tokens to v2 tuna tokens
  HardFork { lock_output_index: Int }

  Lock { lock_output_index: Int, lock_state_input_ref: OutputReference }
}

/// Ensures that maximum lockable tuna is equal to emitted tuna at block height
type LockState {
  block_height: Int,
  current_locked_tuna: Int,
}

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

            let v1_miner_ref =
              utils.resolve_output_reference(reference_inputs, init_utxo_ref)

            expect [(_, 1)] =
              mint
                |> value.from_minted_value
                |> value.tokens(own_policy)
                |> dict.to_list

            // Step 2: Extract input state from inputs
            // In this case only block_number from v1_miner_ref is needed
            expect State { block_number, .. }: State =
              v1_miner_ref.datum |> utils.get_inline_datum

            // Step 3: Created expected output state
            let expected_lock_state =
              InlineDatum(
                LockState { block_height: block_number, current_locked_tuna: 0 },
              )

            let expected_lock_value =
              value.from_asset(own_policy, lock_state_token, 1)

            // Step 4: Validate that the transitioning states are correct
            and {
              // Validate reference input state
              v1_miner_ref.value
                |> value.quantity_of(fortuna_v1_hash, fortuna.master_token_name)
                |> builtin.equals_integer(1),
              // Validate output state
              address == Address(ScriptCredential(own_policy), None),
              datum == expected_lock_state,
              value
                |> value.without_lovelace
                |> builtin.equals_data(expected_lock_value),
            }
          }

          Lock { .. } -> todo
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

    // Fork Spend(0) requirement: Withdrawal script is present
    dict.has_key(withdrawals, own_withdrawal)
  }
}
