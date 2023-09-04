use aiken/builtin
use aiken/dict
use aiken/hash
use aiken/list
use aiken/transaction.{InlineDatum,
  OutputReference, ScriptContext, Transaction} as tx
use aiken/transaction/credential.{ScriptCredential}
use aiken/transaction/value
use fortuna.{master_token_name, token_name}
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
}

validator(fortuna_v1_hash: ByteArray, fork_hash: ByteArray) {
  fn tuna(redeemer: TunaAction, ctx: ScriptContext) -> Bool {
    todo
  }

  fn mine(datum: State, redeemer: MineAction, ctx: ScriptContext) -> Bool {
    todo
  }
}

type HardForkStatus {
  NotForked
  Forked
  FailedFork
}

type ForkDatum {
  HardForkState {
    status: HardForkStatus,
    miner_support: Int,
    fortuna_v1_height: Int,
  }
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
}

type ForkAction {
  Lock {
    key: Option<KeyInput>,
    lock_type: LockActionType,
    lock_output_index: Int,
    nft_output_index: Int,
  }
  HardFork
  Unlock
  AddToNftState { lock_state: OutputReference }
}

type NftAction {
  Initialize
  Mint(OutputReference)
  Burn {
    hard_fork_input_ref: OutputReference,
    tuna_nft_input_ref: OutputReference,
  }
}

const miner_lock_state_token: ByteArray = "miner_lock_state"

const lock_state_token: ByteArray = "lock_state"

const hard_fork_state_token: ByteArray = "hard_fork_state"

validator(
  utxo_ref: OutputReference,
  fortuna_v1_hash: ByteArray,
  block_height: Int,
) {
  fn nft(redeemer: NftAction, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, purpose } = ctx

    expect tx.Mint(own_policy) = purpose

    when redeemer is {
      Initialize -> todo
      Mint(output_ref) -> {
        let Transaction { inputs, .. } = transaction

        let lock_state_input = utils.find_input_resolved(inputs, output_ref)

        // Fork Mint(0) requirement: Either GlobalLockState must be present
        // We rely on the spending of the global state to validate if an NFT is minted or not
        or {
          quantity_of(lock_state_input.value, own_policy, lock_state_token) == 1,
          quantity_of(
            lock_state_input.value,
            own_policy,
            miner_lock_state_token,
          ) == 1,
        }
      }

      Burn { hard_fork_input_ref, tuna_nft_input_ref } -> {
        let Transaction { reference_inputs, mint, inputs, .. } = transaction

        let lock_state_input =
          utils.find_input_resolved(reference_inputs, hard_fork_input_ref)

        // Fork Burn(0) requirement: We validate the global hard fork state is referenced
        expect
          quantity_of(lock_state_input.value, own_policy, hard_fork_state_token) == 1
        //
        expect InlineDatum(datum) = lock_state_input.datum

        expect HardForkState { status, .. }: ForkDatum = datum

        when status is {
          NotForked -> False
          Forked -> todo
          FailedFork -> {
            let mint = value.from_minted_value(mint)

            // Fork Burn(1) requirement: We validate the Fork NFT is burned
            expect [(token_name, -1)] =
              mint |> value.tokens(own_policy) |> dict.to_list

            let lock_state_input =
              utils.find_input_resolved(inputs, tuna_nft_input_ref)

            expect InlineDatum(datum) = lock_state_input.datum

            expect NftState { nft_key }: ForkDatum = datum

            // Fork Burn(2) requirement: We validate the NFT burned has in input with the same key
            nft_key == token_name
          }
        }
      }
    }
  }

  fn fork(datum: ForkDatum, redeemer: ForkAction, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, purpose } = ctx

    expect tx.Spend(own_ref) = purpose

    let Transaction { inputs, mint, outputs, .. } = transaction

    let mint = value.from_minted_value(mint)

    let own_input = utils.find_input_resolved(inputs, own_ref)

    expect ScriptCredential(own_policy) = own_input.address.payment_credential

    when redeemer is {
      Lock { key, lock_type, nft_output_index, lock_output_index } -> {
        let (nft_owner_key, prev_held_amount) =
          // Validate nft key is present or minted
          when key is {
            Some(_) -> todo
            None -> {
              // validate mint
              // Use blake hash since it's faster and this is unrelated to Proof of Work
              let own_token_name =
                own_ref |> builtin.serialise_data |> hash.blake2b_256

              expect [(mint_token_name, 1)] =
                mint |> value.tokens(own_policy) |> dict.to_list

              expect own_token_name == mint_token_name
              //
              (own_token_name, 0)
            }
          }
        // validate nft state output
        let nft_output = list_at(outputs, nft_output_index)

        expect InlineDatum(nft_datum) = nft_output.datum

        expect NftState { nft_key }: ForkDatum = nft_datum

        expect nft_key == nft_owner_key
        //
        let tuna_quantity =
          nft_output.value
            |> quantity_of(fortuna_v1_hash, token_name)

        expect tuna_quantity > prev_held_amount
        //
        // validate lock state output
        let lock_output = list_at(outputs, lock_output_index)

        expect InlineDatum(out_lock_datum) = lock_output.datum

        when lock_type is {
          // In miner lock we also check for the presence of the fortuna v1 script
          MinerLock(fortuna_v1_input_ref) -> {
            expect MinerGlobalLockState {
              miner_locked_tuna: out_miner_locked_tuna,
            }: ForkDatum = out_lock_datum

            expect MinerGlobalLockState { miner_locked_tuna } = datum

            let tuna_v1_input =
              utils.find_input_resolved(inputs, fortuna_v1_input_ref)

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
            expect GlobalLockState { locked_tuna: out_locked_tuna }: ForkDatum =
              out_lock_datum

            expect GlobalLockState { locked_tuna } = datum

            locked_tuna + tuna_quantity - prev_held_amount == out_locked_tuna
          }
        }
      }

      HardFork -> todo
      Unlock -> {
        expect NftState { nft_key } = datum

        quantity_of(mint, own_policy, nft_key) == -1
      }
      // validate 2 things
      // Lock state or Miner Lock state is present
      // No new NFTs are minted
      AddToNftState { lock_state } -> False
    }
  }
}
