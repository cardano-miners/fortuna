import {
  Constr,
  Data,
  Lucid,
  fromHex,
  sha256,
  toHex,
} from "https://deno.land/x/lucid@0.10.1/mod.ts";

import {
  calculateInterlink,
  getDifficulty,
  incrementU8Array,
} from "./utils.ts";

async function mine() {
  const lucid = await Lucid.new();

  while (true) {
    const x = new Uint8Array(16);

    let targetState = new Constr(0, [
      toHex(x),
      0n,
      boostrapHash,
      4n,
      65535n,
      0n,
    ]);

    let targetHash = sha256(sha256(fromHex(Data.to(targetState))));
    let a = getDifficulty(targetHash);

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

    const masterTokenUtxo = await lucid.utxosAt(validatorAddress);
    const mintTokens = { [validatorHash + fromText("TUNA")]: 5000000000n };

    const txMine = await lucid
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
  }
}

await mine();
