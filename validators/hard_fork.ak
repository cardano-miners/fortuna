use aiken/builtin
use aiken/dict
use aiken/hash
use aiken/transaction.{InlineDatum,
  OutputReference, ScriptContext, Transaction} as tx
use aiken/transaction/credential.{Inline, ScriptCredential}
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
  AfterForkLock(OutputReference)
}

type NftForkAction {
  Initialize
  Lock {
    hard_fork_state_ref: OutputReference,
    key: Option<KeyInput>,
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

const hard_fork_state_token: ByteArray = "hard_fork_state"

// maybe we should do time instead of block height?
validator(
  utxo_ref: OutputReference,
  fortuna_v1_hash: ByteArray,
  block_height: Int,
) {
  fn nft_fork(redeemer: Data, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, purpose } = ctx

    when purpose is {
      tx.Mint(own_policy) -> {
        let Transaction { withdrawals, .. } = transaction

        let own_withdrawal = Inline(ScriptCredential(own_policy))

        dict.has_key(withdrawals, own_withdrawal)
      }
      tx.WithdrawFrom(stake_cred) -> {
        expect action: NftForkAction = redeemer
        expect Inline(ScriptCredential(own_policy)) = stake_cred

        todo
      }
      _ -> False
    }
  }

  fn fork(_datum: Data, _redeemer, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, purpose } = ctx

    expect tx.Spend(own_ref) = purpose

    let Transaction { inputs, withdrawals, .. } = transaction

    let own_input = utils.find_input_resolved(inputs, own_ref)

    expect ScriptCredential(withdraw_key) = own_input.address.payment_credential

    let own_withdrawal = Inline(ScriptCredential(withdraw_key))

    dict.has_key(withdrawals, own_withdrawal)
  }
}
// when redeemer is {
//       Lock {
//         hard_fork_state_ref,
//         key,
//         lock_type,
//         nft_output_index,
//         lock_output_index,
//       } -> {
//         let hard_fork_input =
//           utils.find_input_resolved(reference_inputs, hard_fork_state_ref)

//         // Get current hard fork state
//         // Validate Miner lock and normal lock based on hardfork state.
//         let (nft_owner_key, prev_held_amount) =
//           // Validate nft key is present or minted
//           when key is {
//             None -> {
//               // validate mint
//               // Use blake hash since it's faster and this is unrelated to Proof of Work
//               let own_token_name =
//                 own_ref |> builtin.serialise_data |> hash.blake2b_256

//               expect [(mint_token_name, 1)] =
//                 mint |> value.tokens(own_policy) |> dict.to_list

//               // Fork Lock(0) requirement: Minted token name is derived from the input ref
//               expect own_token_name == mint_token_name
//               //
//               (own_token_name, 0)
//             }
//             Some(_) -> todo
//           }
//         // validate nft state output
//         let nft_output = list_at(outputs, nft_output_index)

//         expect InlineDatum(nft_datum) = nft_output.datum

//         expect NftState { nft_key }: ForkDatum = nft_datum

//         // Fork Lock(1) requirement: NFT key is the same as the owner key at the output
//         expect nft_key == nft_owner_key
//         //
//         let tuna_quantity =
//           nft_output.value
//             |> quantity_of(fortuna_v1_hash, token_name)

//         // Fork Lock(2) requirement: Tuna quantity is greater than the previous held amount
//         expect tuna_quantity > prev_held_amount
//         //
//         // validate lock state output
//         let lock_output = list_at(outputs, lock_output_index)

//         expect InlineDatum(out_lock_datum) = lock_output.datum

//         when lock_type is {
//           // In miner lock we also check for the presence of the fortuna v1 script
//           MinerLock(fortuna_v1_input_ref) -> {
//             expect MinerGlobalLockState {
//               miner_locked_tuna: out_miner_locked_tuna,
//             }: ForkDatum = out_lock_datum

//             expect MinerGlobalLockState { miner_locked_tuna } = datum

//             let tuna_v1_input =
//               utils.find_input_resolved(inputs, fortuna_v1_input_ref)

//             expect
//               quantity_of(
//                 tuna_v1_input.value,
//                 fortuna_v1_hash,
//                 master_token_name,
//               ) == 1
//             //
//             miner_locked_tuna + tuna_quantity - prev_held_amount == out_miner_locked_tuna
//           }

//           NormalLock -> {
//             expect GlobalLockState { locked_tuna: out_locked_tuna }: ForkDatum =
//               out_lock_datum

//             expect GlobalLockState { locked_tuna } = datum

//             locked_tuna + tuna_quantity - prev_held_amount == out_locked_tuna
//           }
//           _ -> todo
//         }
//       }

//       HardFork -> todo
//       Unlock -> {
//         expect NftState { nft_key } = datum

//         quantity_of(mint, own_policy, nft_key) == -1
//       }
//       // validate 2 things
//       // Lock state or Miner Lock state is present
//       // No new NFTs are minted
//       AddToNftState { lock_state } -> False
//     }
