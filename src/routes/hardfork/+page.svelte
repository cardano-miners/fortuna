<script lang="ts">
  import { Data } from '@blaze-cardano/tx';
  import {
    Address,
    AssetId,
    HexBlob,
    PlutusData,
    RewardAccount,
    NetworkId,
    CredentialType,
    Hash28ByteBase16,
    TransactionInput,
    TransactionId,
  } from '@blaze-cardano/core';
  import { makeValue } from '@blaze-cardano/sdk';

  // Icons
  import UisPadlock from '~icons/uis/padlock';
  import IonFishOutline from '~icons/ion/fish-outline';

  import fortunaIconBlack from '$lib/assets/fortunaIconBlack.png';

  import { blaze, v1TunaAmount, v2TunaAmount, userAddress } from '$lib/store';
  import * as plutus from '$lib/plutus';
  import {
    HARD_FORK_HASH,
    TUNA_ASSET_NAME,
    V1_TUNA_POLICY_ID,
    V2_TUNA_POLICY_ID,
  } from '$lib/constants';

  let lockTxHash: string | undefined = $state(undefined);
  let buttonDisabled = $state(false);
  let amountToRedeem = $state(0n);

  const tunaTx = async () => {
    buttonDisabled = true;

    try {
      if (!$blaze || !$userAddress) {
        return;
      }

      const forkValidatorAddress = Address.fromBech32(
        'addr1wye5g0txzw8evz0gddc5lad6x5rs9ttaferkun96gr9wd9sj5y20t',
      );
      const rewardAccount = RewardAccount.fromCredential(
        {
          type: CredentialType.ScriptHash,
          hash: Hash28ByteBase16(HARD_FORK_HASH),
        },
        NetworkId.Mainnet,
      );

      const tunaV2Redeem = Data.to('Redeem', plutus.Tunav2Tuna.redeemer);

      const amountToRedeemNat = amountToRedeem * 100_000_000n;

      const forkScriptRef = new TransactionInput(
        TransactionId('55897091192254abbe6501bf4fd63f4d9346e9c2f5300cadfcbe2cda25fd6351'),
        0n,
      );

      const mintScriptRef = new TransactionInput(
        TransactionId('80874829afb2cb34e23d282d763b419e26e9fb976fe8a7044eebbdf6531214b7'),
        0n,
      );

      const hardforkRedeem = Data.to(
        { Lock: { lockOutputIndex: 0n, lockingAmount: amountToRedeemNat } },
        plutus.SimplerforkNftFork.redeemer,
      );

      // lock_state
      const lockStateAssetId = AssetId(HARD_FORK_HASH + '6c6f636b5f7374617465');

      const tunaV1AssetId = AssetId(V1_TUNA_POLICY_ID + TUNA_ASSET_NAME);
      const tunaV2AssetId = AssetId(V2_TUNA_POLICY_ID + TUNA_ASSET_NAME);

      const lockUtxo = await $blaze.provider.getUnspentOutputByNFT(lockStateAssetId);
      const lockRedeemer = Data.to(
        { wrapper: PlutusData.fromCbor(HexBlob('00')) },
        plutus.SimplerforkFork._redeemer,
      );

      const refOutputs = await $blaze.provider.resolveUnspentOutputs([
        forkScriptRef,
        mintScriptRef,
      ]);

      const lockDatum = Data.from(
        lockUtxo.output().datum()!.asInlineData()!,
        plutus.SimplerforkFork._datum,
      );

      const currentLockedTuna = lockDatum.currentLockedTuna + amountToRedeemNat;
      const outputLockDatum = Data.to(
        {
          blockHeight: lockDatum.blockHeight,
          currentLockedTuna,
        },
        plutus.SimplerforkFork._datum,
      );

      const lockTx = await $blaze
        .newTransaction()
        .addReferenceInput(refOutputs[0])
        .addReferenceInput(refOutputs[1])
        .addInput(lockUtxo, lockRedeemer)
        .lockAssets(
          forkValidatorAddress,
          makeValue(0n, [lockStateAssetId, 1n], [tunaV1AssetId, currentLockedTuna]),
          outputLockDatum,
        )
        .addMint(
          AssetId.getPolicyId(tunaV2AssetId),
          new Map([[AssetId.getAssetName(tunaV2AssetId), amountToRedeemNat]]),
          tunaV2Redeem,
        )
        .addWithdrawal(rewardAccount, 0n, hardforkRedeem)
        .complete();

      const signedLockTx = await $blaze.signTransaction(lockTx);

      const lockTxId = await $blaze.wallet.postTransaction(signedLockTx);

      lockTxHash = lockTxId;
    } catch (e) {
      console.log(e);
    }

    buttonDisabled = false;
  };
</script>

<div class="grid grid-cols-1 justify-center p-4">
  <div class="card max-w-full xl:max-w-[35vw] justify-center shadow-xl mt-5 bg-base-300">
    <div class="card-body">
      <h2 class="card-title text-3xl font-bold text-white">Redeem Your V1 $TUNA</h2>
      <div class="grid grid-cols-1 gap-8 py-6">
        <div class="grid grid-cols-3 items-center">
          <div class="col-span-1">
            <div class="stat-title text-error">$TUNA V1</div>
            <div class="stat-value text-white">
              {($v1TunaAmount / 100_000_000n).toLocaleString('en-US')}
            </div>
          </div>

          <div class="col-span-1 flex justify-center">
            <button
              class="btn btn-accent btn-outline btn-circle"
              onclick={(e) => {
                e.preventDefault();

                amountToRedeem = $v1TunaAmount / 100_000_000n;
              }}
            >
              <IonFishOutline />
            </button>
          </div>

          <div class="col-span-1 text-right">
            <div class="stat-title text-success">$TUNA V2</div>
            <div class="stat-value text-white">
              {($v2TunaAmount / 100_000_000n).toLocaleString('en-US')}
            </div>
          </div>
        </div>

        <label class="input input-bordered flex items-center gap-2">
          <img src={fortunaIconBlack} alt="fortuna icon" class="w-6 h-6 -ml-2 opacity-70" />

          <input
            value={amountToRedeem.toLocaleString('en-US')}
            oninput={(e) => {
              amountToRedeem = BigInt(e.currentTarget.value.replace(/\D/g, ''));

              e.currentTarget.value = amountToRedeem.toLocaleString('en-US');
            }}
            type="text"
            placeholder="0"
            inputmode="decimal"
            class="grow"
          />
        </label>

        <div class="relative"></div>

        <button
          class="btn btn-primary"
          class:btn-disabled={buttonDisabled}
          disabled={buttonDisabled}
          onclick={tunaTx}
        >
          <UisPadlock />Redeem
        </button>

        {#if lockTxHash}
          <a href={`https://cexplorer.io/tx/${lockTxHash}`}>View Transaction</a>
        {/if}
      </div>
    </div>
  </div>
</div>
