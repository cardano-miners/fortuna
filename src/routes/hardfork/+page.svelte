<script lang="ts">
  import { onMount } from 'svelte';
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
  import MaterialSymbolsAddShoppingCartSharp from '~icons/material-symbols/add-shopping-cart-sharp';

  import { blaze, v1TunaAmount, userAddress } from '$lib/store';
  import * as plutus from '$lib/plutus';
  import UisPadlock from '~icons/uis/padlock';
  import IonFishOutline from '~icons/ion/fish-outline';
  import {
    HARD_FORK_HASH,
    TUNA_ASSET_NAME,
    V1_TUNA_POLICY_ID,
    V2_TUNA_POLICY_ID,
  } from '$lib/constants';

  // types
  interface TimeLeft {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }
  let timeLeft: TimeLeft;
  let lockTxHash: string | undefined;

  // parse address transactions / mint transactions or any other data to check how many tuna was sent already
  let lockedTuna = 89400;

  // unix timestamp and timer
  let targetTime = 1718719528 * 1000; // convert to milliseconds

  // get the minted %, can pass real data but a static value is ok tho
  const totalAssets = 21000000;
  const circulatingAssets = 1525600;
  const circulatingPercentage = (circulatingAssets / totalAssets) * 100;

  // minswap buy add
  let tunaMinswap =
    'https://app.minswap.org/pt-BR/swap?currencySymbolA=&tokenNameA=&currencySymbolB=279f842c33eed9054b9e3c70cd6a3b32298259c24b78b895cb41d91a&tokenNameB=54554e41';

  onMount(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const distance = targetTime - now;

      timeLeft = {
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
      };
    }, 1000);

    return () => clearInterval(interval);
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

<div class="grid grid-cols-1 xl:grid-cols-2 justify-center m-4 items-center">
  <div class="card max-w-full xl:max-w-[35vw] justify-center shadow-xl mt-5 bg-base-300">
    <div class="card-body">
      <h2 class="card-title text-3xl font-bold text-white">$TUNA V1 Metrics</h2>
      <div class="grid grid-cols-1 xl:grid-cols-3 xl:grid-rows-2 gap-4 my-6">
        <div class="stat border border-base-100 border-l-8 border-l-secondary">
          <div class="stat-title">Circulating Supply</div>
          <div class="stat-value text-secondary">1.5M</div>
        </div>

        <div class="stat border border-base-100 border-l-8 border-l-red-600">
          <div class="stat-title">Max Supply</div>
          <div class="stat-value text-red-500">21M</div>
        </div>

        <div class="stat border border-base-100 border-l-8 border-l-purple-500">
          <div class="stat-title">Minted</div>
          <div class="stat-value text-purple-500">{circulatingPercentage.toFixed(2)}%</div>
        </div>

        <div class="stat border border-base-100 border-l-8 border-l-lime-300">
          <div class="stat-title">Total Locked v2</div>
          <div class="stat-value text-white items-center">
            0 <span class="text-2xl text-lime-300">$TUNA</span>
          </div>
        </div>

        <div class="stat border border-base-100 border-l-8 border-l-orange-500">
          <div class="stat-title">Locked %</div>
          <div class="stat-value text-orange-500">0%</div>
        </div>

        <div
          class="stat border border-base-100 border-l-8 border-l-green-500 row-start-1 xl:row-start-auto">
          <div class="stat-figure text-primary"></div>
          <div class="stat-title">Time left</div>

          <div class="stat-value text-white">
            {#if timeLeft && timeLeft.days !== undefined && timeLeft.hours !== undefined && timeLeft.minutes !== undefined && timeLeft.seconds !== undefined}
              <span class="countdown font-mono text-lg">
                {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
              </span>
            {:else}
              <span class="loading loading-dots loading-xs"></span>
            {/if}
            <div class="text-sm font-light mt-2">TEST DATA ONLY</div>
          </div>
        </div>
      </div>
      <div class="card-actions justify-end"></div>
    </div>
  </div>

  <div
    class="col-start-1 row-start-1 xl:col-start-2 card max-w-full xl:min-w-[40vw] justify-center shadow-xl mt-5 bg-base-300">
    <div class="stats bg-base-300 stats-vertical lg:stats-horizontal">
      <div class="stat">
        <div class="stat-title text-success">$TUNA V1 Available</div>
        <div class="stat-figure text-primary">
          {#if $v1TunaAmount > 0}
            <button class="btn btn-md btn-success" on:click={tunaTx}
              ><UisPadlock class="text-black" />
              Lock
            </button>
          {:else}
            <a href={tunaMinswap} target="_blank" class="btn btn-md btn-warning"
              ><span class="hidden md:flex">Get v1 $TUNA</span>
              <span class="md:hidden">Buy Some</span>
              <MaterialSymbolsAddShoppingCartSharp class="text-black" /></a>
          {/if}
        </div>
        <div class="stat-value text-white">{$v1TunaAmount.toLocaleString('en-US')}</div>
        <div class="stat-actions"></div>
      </div>

      <div class="stat">
        <div class="stat-title text-success">My Locked Tuna</div>
        <div class="stat-figure text-primary">
          <IonFishOutline class="text-primary text-3xl" />
        </div>
        <div class="stat-value text-white">{lockedTuna.toLocaleString('en-US')}</div>
        <div class="stat-actions"></div>
      </div>
    </div>
  </div>
</div>
