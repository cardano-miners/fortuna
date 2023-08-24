import * as colors from "https://deno.land/std@0.199.0/fmt/colors.ts";
import * as cbor from "https://deno.land/x/cbor@v1.4.1/index.js";
import {
  fromHex,
  SpendingValidator,
  toHex,
  TxSigned,
} from "https://deno.land/x/lucid@0.10.1/mod.ts";

import blueprint from "../plutus.json" assert { type: "json" };

const MAX_TX_EX_STEPS = 10000000000;
const MAX_TX_EX_MEM = 14000000;
const MAX_TX_SIZE = 16384;

export function readValidator(): SpendingValidator {
  const validator = blueprint.validators[0];

  return {
    type: "PlutusV2",
    script: toHex(cbor.encode(fromHex(validator.compiledCode))),
  };
}

export function printExecutionDetails(tx: TxSigned, name: string) {
  const redeemers = tx.txSigned.witness_set().redeemers()!;
  let steps = 0;
  let mem = 0;

  for (let i = 0; i < redeemers.len(); i++) {
    const red = redeemers.get(i);
    steps += parseInt(red.ex_units().steps().to_str(), 10);
    mem += parseInt(red.ex_units().mem().to_str(), 10);
  }

  const remainingMem = MAX_TX_EX_MEM - mem;
  const remainingSteps = MAX_TX_EX_STEPS - steps;
  const txBytes = tx.txSigned.to_bytes().length;
  const remainingTxBytes = MAX_TX_SIZE - txBytes;
  const fee = tx.txSigned.body().fee().to_str();

  const text = `
  ${colors.bold(colors.brightMagenta(name))} - ${colors.green("passed")}
  
    ${colors.bold(colors.blue("mem"))}:       ${
    colors.brightGreen(mem.toString())
  }
    ${colors.bold(colors.blue("remaining"))}: ${
    colors.brightCyan(remainingMem.toString())
  }
    
    ${colors.bold(colors.blue("cpu"))}:       ${
    colors.brightGreen(steps.toString())
  }
    ${colors.bold(colors.blue("remaining"))}: ${
    colors.brightCyan(remainingSteps.toString())
  }
    
    ${colors.bold(colors.blue("tx size"))}:   ${
    colors.brightGreen(txBytes.toString())
  }
    ${colors.bold(colors.blue("remaining"))}: ${
    colors.brightCyan(remainingTxBytes.toString())
  }
    
    ${colors.bold(colors.blue("fee"))}: ${
    colors.brightGreen(fee.toUpperCase())
  }`;

  console.log(text);

  if (remainingMem < 0) {
    console.log(colors.red("  Out of mem"));
  }

  if (remainingSteps < 0) {
    console.log(colors.red("  Out of cpu"));
  }

  if (remainingTxBytes < 0) {
    console.log(colors.red("  Out of tx space"));
  }
}

export function randomAssetId() {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function getDifficulty(
  hash: Uint8Array,
): { leadingZeros: bigint; difficulty_number: bigint } {
  let leadingZeros = 0;
  let difficulty_number = 0;
  for (const [indx, chr] of hash.entries()) {
    if (chr !== 0) {
      if ((chr & 0x0F) === chr) {
        leadingZeros += 1;
        difficulty_number += chr * 4096;
        difficulty_number += hash[indx + 1] * 16;
        difficulty_number += Math.floor(hash[indx + 2] / 16);
        return {
          leadingZeros: BigInt(leadingZeros),
          difficulty_number: BigInt(difficulty_number),
        };
      } else {
        difficulty_number += chr * 256;
        difficulty_number += hash[indx + 1];
        return {
          leadingZeros: BigInt(leadingZeros),
          difficulty_number: BigInt(difficulty_number),
        };
      }
    } else {
      leadingZeros += 2;
    }
  }
  return { leadingZeros: 32n, difficulty_number: 0n };
}

export function incrementU8Array(
  x: Uint8Array,
) {
  for (let i = 0; i < x.length; i++) {
    if (x[i] === 255) {
      x[i] = 0;
    } else {
      x[i] += 1;
      break;
    }
  }
}

export function halfDifficultyNumber(
  a: { leadingZeros: bigint; difficulty_number: bigint },
): { leadingZeros: bigint; difficulty_number: bigint } {
  const new_a = a.difficulty_number / 2n;
  if (new_a < 4096n) {
    return {
      leadingZeros: a.leadingZeros + 1n,
      difficulty_number: new_a * 16n,
    };
  } else {
    return {
      leadingZeros: a.leadingZeros,
      difficulty_number: new_a,
    };
  }
}

export function calculateInterlink(
  currentHash: string,
  a: { leadingZeros: bigint; difficulty_number: bigint },
  b: { leadingZeros: bigint; difficulty_number: bigint },
): string[] {
  let b_half = halfDifficultyNumber(b);

  let interlink: string[] = [];

  while (
    b_half.leadingZeros < a.leadingZeros ||
    b_half.leadingZeros == a.leadingZeros &&
      b_half.difficulty_number > a.difficulty_number
  ) {
    interlink = [currentHash, ...interlink];
    b_half = halfDifficultyNumber(b_half);
  }

  return interlink;
}
