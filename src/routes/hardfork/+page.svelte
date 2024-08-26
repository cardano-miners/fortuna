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
  let amountToRedeem = $state(0n);

  $effect(() => {
    console.log(BigInt(amountToRedeem));
  });

  const tunaTx = async () => {
    if (!$blaze || !$userAddress) {
      return;
    }

    const forkValidatorAddress = Address.fromBech32('');
    const rewardAccount = RewardAccount.fromCredential(
      { type: CredentialType['ScriptHash'], hash: Hash28ByteBase16('') },
      NetworkId.Mainnet,
    );

    const tunaV2Redeem = Data.to('Redeem', plutus.Tunav2Tuna.redeemer);

    const hardforkRedeem = Data.to(
      { Lock: { lockOutputIndex: 0n, lockingAmount: $v1TunaAmount } },
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

    const lockDatum = Data.from(
      lockUtxo.output().datum()!.asInlineData()!,
      plutus.SimplerforkFork._datum,
    );

    const inputUtxos = await $blaze.provider.getUnspentOutputsWithAsset(
      $userAddress,
      tunaV1AssetId,
    );

    const currentLockedTuna = lockDatum.currentLockedTuna + $v1TunaAmount;
    const outputLockDatum = Data.to(
      {
        blockHeight: lockDatum.blockHeight,
        currentLockedTuna,
      },
      plutus.SimplerforkFork._datum,
    );

    const lockTx = await $blaze
      .newTransaction()
      .addMint(
        AssetId.getPolicyId(tunaV2AssetId),
        new Map([[AssetId.getAssetName(tunaV2AssetId), $v1TunaAmount]]),
        tunaV2Redeem,
      )
      .addInput(lockUtxo, lockRedeemer)
      .addInput(inputUtxos[0])
      .lockAssets(
        forkValidatorAddress,
        makeValue(0n, [lockStateAssetId, 1n], [tunaV1AssetId, currentLockedTuna]),
        outputLockDatum,
      )
      .addWithdrawal(rewardAccount, 0n, hardforkRedeem)
      .complete();

    const signedLockTx = await $blaze.signTransaction(lockTx);

    const lockTxId = await $blaze.wallet.postTransaction(signedLockTx);

    lockTxHash = lockTxId;
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
              }}><IonFishOutline /></button>
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
            class="grow" />
        </label>

        <div class="relative"></div>

        <button class="btn btn-primary" onclick={tunaTx}><UisPadlock />Redeem</button>
      </div>
    </div>
  </div>
</div>
