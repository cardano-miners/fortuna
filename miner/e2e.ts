import {
  Constr,
  Data,
  fromHex,
  fromText,
  sha256,
  toHex,
} from "https://deno.land/x/lucid@0.10.1/mod.ts";

import { test } from "./test.ts";
import {
  calculateInterlink,
  getDifficulty,
  incrementU8Array,
} from "./utils.ts";

await test("First Mined Block", async (ctx) => {
  ctx.emulator.awaitBlock(50);
  ctx.lucid.selectWalletFromPrivateKey(ctx.minerPk);

  const timeNow = ctx.emulator.now();

  const boostrapHash = toHex(sha256(sha256(fromHex(Data.to(ctx.initOutRef)))));

  const preDatum = new Constr(0, [
    0n,
    boostrapHash,
    4n,
    65535n,
    0n,
    BigInt(45000 + timeNow),
    0n,
    [],
  ]);

  const datum = Data.to(preDatum);

  const validatorAddress = ctx.lucid.utils.validatorToAddress(ctx.validator);

  const validatorHash = ctx.lucid.utils.validatorToScriptHash(ctx.validator);

  const masterToken = { [validatorHash + fromText("lord tuna")]: 1n };

  const allRefUtxo = await ctx.lucid.utxosAt(ctx.refAddr);

  const allCollectUtxo = await ctx.lucid.utxosAt(ctx.minerAddr);

  const refUtxo = allRefUtxo.filter((u) => u.scriptRef);

  // first tx -- genesis
  const tx = await ctx.lucid
    .newTx()
    .collectFrom(allCollectUtxo)
    .payToContract(validatorAddress, { inline: datum }, masterToken)
    .mintAssets(masterToken, Data.to(new Constr(1, [])))
    .readFrom(refUtxo)
    .validFrom(timeNow)
    .validTo(timeNow + 90000)
    .complete();

  const signed1 = await tx.sign().complete();

  await signed1.submit();

  ctx.emulator.awaitBlock(20);

  // second tx -- mine

  const x = new Uint8Array(16);

  let targetState = new Constr(0, [toHex(x), 0n, boostrapHash, 4n, 65535n, 0n]);

  let targetHash = sha256(sha256(fromHex(Data.to(targetState))));
  let a;

  while (true) {
    a = getDifficulty(targetHash);
    if (
      a.leadingZeros > 4n ||
      (a.leadingZeros == 4n && a.difficulty_number < 65535n)
    ) {
      break;
    }

    incrementU8Array(x);

    targetState = new Constr(0, [toHex(x), 0n, boostrapHash, 4n, 65535n, 0n]);

    targetHash = sha256(sha256(fromHex(Data.to(targetState))));
  }

  console.log("targetHash", toHex(targetHash));
  console.log("x", toHex(x));

  const realTimeNow = ctx.emulator.now();

  const interlink = calculateInterlink(toHex(targetHash), a, {
    leadingZeros: 4n,
    difficulty_number: 65535n,
  });

  const postDatum = new Constr(0, [
    1n,
    toHex(targetHash),
    4n,
    65535n,
    BigInt(45000 + realTimeNow - (45000 + timeNow)),
    BigInt(45000 + realTimeNow),
    0n,
    interlink,
  ]);

  const outDat = Data.to(postDatum);

  const masterTokenUtxo = await ctx.lucid.utxosAt(validatorAddress);
  const mintTokens = { [validatorHash + fromText("TUNA")]: 5000000000n };

  const txMine = await ctx.lucid
    .newTx()
    .collectFrom(masterTokenUtxo, Data.to(new Constr(1, [toHex(x)])))
    .payToAddressWithData(validatorAddress, { inline: outDat }, masterToken)
    .readFrom(refUtxo)
    .mintAssets(mintTokens, Data.to(new Constr(0, [])))
    .validTo(realTimeNow + 90000)
    .validFrom(realTimeNow)
    .complete();

  const signed2 = await txMine.sign().complete();

  await signed2.submit();

  ctx.emulator.awaitBlock(20);

  return signed2;
});

// await test("Genesis", async (ctx) => {
//   ctx.lucid.selectWalletFromPrivateKey(ctx.minerPk);

//   const timeNow = ctx.emulator.now();

//   const boostrapHash = toHex(sha256(sha256(fromHex(Data.to(ctx.initOutRef)))));

//   const preDatum = new Constr(0, [
//     0n,
//     boostrapHash,
//     4n,
//     65535n,
//     0n,
//     BigInt(45000 + timeNow),
//     0n,
//     [],
//   ]);

//   const datum = Data.to(
//     preDatum,
//   );

//   const validatorAddress = ctx.lucid.utils.validatorToAddress(ctx.validator);

//   const validatorHash = ctx.lucid.utils.validatorToScriptHash(ctx.validator);

//   const masterToken = { [validatorHash + fromText("lord tuna")]: 1n };

//   const allRefUtxo = await ctx.lucid.utxosAt(ctx.refAddr);

//   const allCollectUtxo = await ctx.lucid.utxosAt(ctx.minerAddr);

//   const refUtxo = allRefUtxo.filter((u) => u.scriptRef);
//   console.log("HERE HERE111122");

//   // first tx -- genesis
//   const tx = await ctx.lucid
//     .newTx()
//     .collectFrom(allCollectUtxo)
//     .payToContract(validatorAddress, { inline: datum }, masterToken)
//     .mintAssets(masterToken, Data.to(new Constr(1, [])))
//     .readFrom(refUtxo).validFrom(timeNow).validTo(timeNow + 90000)
//     .complete();

//   console.log("HERE HERE1111");
//   const signed = await tx.sign().complete();

//   await signed.submit();

//   ctx.emulator.awaitBlock(4);
//   console.log("signed1");

//   return signed;
// });
