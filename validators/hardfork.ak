use aiken/dict
use aiken/list
use aiken/transaction.{InlineDatum,
  OutputReference, ScriptContext, Transaction} as tx
use aiken/transaction/credential.{Inline, ScriptCredential}
use fortuna/utils.{quantity_of}
use hardfork/hftypes.{
  ForkDatum, Forked, HardForkState, LockAction, LockState, MinerLockState,
  NotForked,
}
use hardfork_validation as hfv

type NftForkAction {
  Initialize

  Lock {
    hard_fork_state_ref: OutputReference,
    lock_output_index: Int,
    nft_output_index: Int,
    ownership_key_index: Option<Int>,
    lock_action: LockAction,
  }

  HardFork {
    hardfork_state_input: OutputReference,
    v2_miner_output: Int,
    lock_output_index: Int,
    nft_output_index: Int,
    ownership_key_index: Option<Int>,
    hardfork_output_index: Int,
    lock_action: LockAction,
  }

  Unlock { hard_fork_state_ref: OutputReference }

  Burn {
    hard_fork_state_ref: OutputReference,
    locked_tokens_ref: OutputReference,
  }
  FailedFork { fortuna_v1_output: Int }
}

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

        when action is {
          // Check if the input is spent and proper initial state is made
          // No need to check spends from own script hash in intialize
          // The reason being is no meaningful locks can happen before initialize
          Initialize -> hfv.initialize(init_utxo_ref, transaction, own_policy)

          Lock {
            hard_fork_state_ref,
            lock_output_index,
            nft_output_index,
            ownership_key_index,
            lock_action,
          } -> {
            expect HardForkState { status, fork_block_height, .. } =
              hfv.validate_hardfork_state(
                transaction.reference_inputs,
                hard_fork_state_ref,
                own_policy,
              )

            when status is {
              NotForked ->
                // Since this function is only used once
                // the compiler will optimize it out so all the function param
                // passing is free. Same with the others below
                hfv.lock_not_forked(
                  fortuna_v1_hash,
                  lock_output_index,
                  nft_output_index,
                  ownership_key_index,
                  lock_action,
                  transaction,
                  own_policy,
                  fork_block_height,
                )
              Forked -> {
                let total_emission_at_fork =
                  hfv.calculate_emission(fork_block_height)

                expect Some(miner_locked_state_output) =
                  list.find(
                    transaction.reference_inputs,
                    fn(input) {
                      quantity_of(
                        input.output.value,
                        own_policy,
                        hfv.miner_lock_state_token,
                      ) == 1
                    },
                  )

                expect InlineDatum(miner_locked_state_datum) =
                  miner_locked_state_output.output.datum

                expect MinerLockState { locked_tuna: miner_locked_tuna, .. }: ForkDatum =
                  miner_locked_state_datum

                hfv.lock_after_fork(
                  fortuna_v1_hash,
                  lock_output_index,
                  nft_output_index,
                  ownership_key_index,
                  lock_action,
                  transaction,
                  own_policy,
                  total_emission_at_fork,
                  miner_locked_tuna,
                )
              }
              _ -> False
            }
          }

          // We allow unlocking of fortuna v1 tokens in the case of a failed fork
          // We only allow an input to be spent under the hard fork failed condition and when burning the nft key
          Unlock { hard_fork_state_ref } ->
            hfv.unlock_failed_fork(transaction, own_policy, hard_fork_state_ref)

          Burn { hard_fork_state_ref, locked_tokens_ref } ->
            hfv.burn_forked(
              transaction,
              own_policy,
              hard_fork_state_ref,
              locked_tokens_ref,
            )

          HardFork {
            hardfork_state_input,
            hardfork_output_index,
            nft_output_index,
            lock_output_index,
            ownership_key_index,
            v2_miner_output,
            lock_action,
          } -> {
            expect Some(locked_state_input) =
              list.find(
                transaction.reference_inputs,
                fn(input) {
                  quantity_of(
                    input.output.value,
                    own_policy,
                    hfv.lock_state_token,
                  ) == 1
                },
              )

            expect InlineDatum(locked_state_datum) =
              locked_state_input.output.datum

            expect LockState { locked_tuna: user_locked_tuna }: ForkDatum =
              locked_state_datum

            hfv.hard_fork(
              fortuna_v1_hash,
              hardfork_state_input,
              hardfork_output_index,
              lock_output_index,
              nft_output_index,
              ownership_key_index,
              v2_miner_output,
              lock_action,
              transaction,
              own_policy,
              user_locked_tuna,
            )
          }
          FailedFork { fortuna_v1_output } ->
            hfv.failed_fork(
              fortuna_v1_hash,
              fortuna_v1_output,
              transaction,
              own_policy,
            )
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
