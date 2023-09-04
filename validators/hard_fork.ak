use aiken/builtin
use aiken/dict
use aiken/hash
use aiken/list
use aiken/transaction.{InlineDatum,
  OutputReference, ScriptContext, Transaction} as tx
use aiken/transaction/credential.{ScriptCredential}
use aiken/transaction/value.{quantity_of}
use fortuna.{master_token_name, token_name}
use fortuna/types.{State}

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
  MinerLockState { miner_locked_tuna: Int }
  LockState { locked_tuna: Int }
  NftState { nft_key: ByteArray }
}

type KeyInput {
  key: ByteArray,
  input: OutputReference,
}

type LockType {
  MinerLock(OutputReference)
  NormalLock
}

type ForkAction {
  Lock {
    key: Option<KeyInput>,
    lock_type: LockType,
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
  Burn { hard_fork_input: OutputReference, tuna_nft_input: OutputReference }
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

        expect Some(lock_state_input) =
          list.find(inputs, fn(input) { input.output_reference == output_ref })

        or {
          quantity_of(
            lock_state_input.output.value,
            own_policy,
            lock_state_token,
          ) == 1,
          quantity_of(
            lock_state_input.output.value,
            own_policy,
            miner_lock_state_token,
          ) == 1,
        }
      }

      Burn { hard_fork_input, tuna_nft_input } -> {
        let Transaction { reference_inputs, mint, inputs, .. } = transaction

        expect Some(lock_state_input) =
          list.find(
            reference_inputs,
            fn(ref_input) { ref_input.output_reference == hard_fork_input },
          )

        expect
          quantity_of(
            lock_state_input.output.value,
            own_policy,
            hard_fork_state_token,
          ) == 1
        expect InlineDatum(datum) = lock_state_input.output.datum

        expect HardForkState { status, .. }: ForkDatum = datum

        when status is {
          NotForked -> False
          Forked -> todo
          FailedFork -> {
            let mint = value.from_minted_value(mint)

            expect [(token_name, -1)] =
              mint |> value.tokens(own_policy) |> dict.to_list

            expect Some(lock_state_input) =
              list.find(
                inputs,
                fn(input) { input.output_reference == tuna_nft_input },
              )

            expect InlineDatum(datum) = lock_state_input.output.datum

            expect NftState { nft_key }: ForkDatum = datum

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

    expect Some(own_input) =
      list.find(inputs, fn(input) { input.output_reference == own_ref })

    expect ScriptCredential(own_policy) =
      own_input.output.address.payment_credential

    when redeemer is {
      Lock { key, lock_type, nft_output_index, lock_output_index } -> {
        let (nft_owner_key, prev_held_amount) =
          // Validate nft key is present or minted
          when key is {
            Some(_) -> todo
            None -> {
              // validate mint
              let own_token_name =
                own_ref |> builtin.serialise_data |> hash.sha2_256

              expect [(mint_token_name, 1)] =
                mint |> value.tokens(own_policy) |> dict.to_list

              expect own_token_name == mint_token_name
              //
              (own_token_name, 0)
            }
          }
        // validate nft state output
        expect Some(nft_output_index) = list.at(outputs, nft_output_index)

        expect InlineDatum(nft_datum) = nft_output_index.datum

        expect NftState { nft_key }: ForkDatum = nft_datum

        expect nft_key == nft_owner_key
        //
        let tuna_quantity =
          nft_output_index.value
            |> quantity_of(fortuna_v1_hash, token_name)

        // validate lock state output
        expect Some(lock_output_index) = list.at(outputs, lock_output_index)

        expect InlineDatum(out_lock_datum) = lock_output_index.datum

        when lock_type is {
          MinerLock(fortuna_v1_input_ref) -> {
            expect MinerLockState { miner_locked_tuna: out_miner_locked_tuna }: ForkDatum =
              out_lock_datum

            expect MinerLockState { miner_locked_tuna } = datum

            expect Some(tuna_v1_input) =
              list.find(
                inputs,
                fn(input) { input.output_reference == fortuna_v1_input_ref },
              )

            expect
              quantity_of(
                tuna_v1_input.output.value,
                fortuna_v1_hash,
                master_token_name,
              ) == 1
            //
            miner_locked_tuna + tuna_quantity - prev_held_amount == out_miner_locked_tuna
          }

          NormalLock -> {
            expect LockState { locked_tuna: out_locked_tuna }: ForkDatum =
              out_lock_datum

            expect LockState { locked_tuna } = datum

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
