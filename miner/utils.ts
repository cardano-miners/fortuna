import colors from 'colors/safe';
import crypto from 'crypto';
import blake from 'blakejs';

import blueprint from '../plutus.json' assert { type: 'json' };
import {
  HexBlob,
  PlutusData,
  PlutusV2Script,
  Script,
  toHex,
  Transaction,
} from '@blaze-cardano/core';
import { Data } from '@blaze-cardano/tx';

const MAX_TX_EX_STEPS = 10000000000n;
const MAX_TX_EX_MEM = 14000000n;
const MAX_TX_SIZE = 16384;

export async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', input);

  return new Uint8Array(hash);
}

// TODO - Implement blake256
export function blake256(input: Uint8Array): Uint8Array {
  const hash = blake.blake2b(input, undefined, 32);

  return hash;
}

export function readValidator(): Script {
  const validator = blueprint.validators.filter((v) => v.title === 'tunav1.mint')[0];

  return Script.newPlutusV2Script(new PlutusV2Script(HexBlob(validator.compiledCode)));
}

export function readValidators(): Script[] {
  const forkValidator = blueprint.validators.filter((v) => v.title === 'simplerfork.fork')[0];
  const fortunaV2Mint = blueprint.validators.filter((v) => v.title === 'tunav2.tuna')[0];
  const fortunaV2Spend = blueprint.validators.filter((v) => v.title === 'tunav2.mine')[0];

  return [
    Script.newPlutusV2Script(new PlutusV2Script(HexBlob(forkValidator.compiledCode))),
    Script.newPlutusV2Script(new PlutusV2Script(HexBlob(fortunaV2Mint.compiledCode))),
    Script.newPlutusV2Script(new PlutusV2Script(HexBlob(fortunaV2Spend.compiledCode))),
  ];
}

export function readNewSpendValidator(): Script {
  const spendValidator = blueprint.validators.filter((v) => v.title === 'new_spend.mine')[0];

  return Script.newPlutusV2Script(new PlutusV2Script(HexBlob(spendValidator.compiledCode)));
}

export function printExecutionDetails(tx: Transaction, name: string) {
  const redeemers = tx.witnessSet().redeemers()!.values();
  let steps = 0n;
  let mem = 0n;

  for (const red of redeemers) {
    steps += red.exUnits().steps();
    mem += red.exUnits().mem();
  }

  const remainingMem = MAX_TX_EX_MEM - mem;
  const remainingSteps = MAX_TX_EX_STEPS - steps;
  const txBytes = tx.toCbor().length / 2;
  const remainingTxBytes = MAX_TX_SIZE - txBytes;
  const fee = tx.body().fee();

  const text = `
  ${colors.bold(colors.magenta(name))} - ${colors.green('passed')}

    ${colors.bold(colors.blue('mem'))}:       ${colors.green(mem.toString())}
    ${colors.bold(colors.blue('remaining'))}: ${colors.cyan(remainingMem.toString())}

    ${colors.bold(colors.blue('cpu'))}:       ${colors.green(steps.toString())}
    ${colors.bold(colors.blue('remaining'))}: ${colors.cyan(remainingSteps.toString())}

    ${colors.bold(colors.blue('tx size'))}:   ${colors.green(txBytes.toString())}
    ${colors.bold(colors.blue('remaining'))}: ${colors.cyan(remainingTxBytes.toString())}

    ${colors.bold(colors.blue('fee'))}: ${colors.green(fee.toString())}`;

  console.log(text);

  if (remainingMem < 0) {
    console.log(colors.red('  Out of mem'));
  }

  if (remainingSteps < 0) {
    console.log(colors.red('  Out of cpu'));
  }

  if (remainingTxBytes < 0) {
    console.log(colors.red('  Out of tx space'));
  }
}

export function randomAssetId() {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function getDifficulty(hash: Uint8Array): {
  leadingZeros: bigint;
  difficultyNumber: bigint;
} {
  let leadingZeros = 0;
  let difficulty_number = 0;
  for (const [indx, chr] of hash.entries()) {
    if (chr !== 0) {
      if ((chr & 0x0f) === chr) {
        leadingZeros += 1;
        difficulty_number += chr * 4096;
        difficulty_number += hash[indx + 1] * 16;
        difficulty_number += Math.floor(hash[indx + 2] / 16);
        return {
          leadingZeros: BigInt(leadingZeros),
          difficultyNumber: BigInt(difficulty_number),
        };
      } else {
        difficulty_number += chr * 256;
        difficulty_number += hash[indx + 1];
        return {
          leadingZeros: BigInt(leadingZeros),
          difficultyNumber: BigInt(difficulty_number),
        };
      }
    } else {
      leadingZeros += 2;
    }
  }
  return { leadingZeros: 32n, difficultyNumber: 0n };
}

export function incrementNonce(x: Uint8Array) {
  for (let i = 0; i < x.length; i++) {
    if (x[i] === 255) {
      x[i] = 0;
    } else {
      x[i] += 1;
      break;
    }
  }
}

export function incrementNonceV2(x: Uint8Array) {
  const subX = x.slice(4, 20);

  for (let i = 0; i < subX.length; i++) {
    if (subX[i] === 255) {
      subX[i] = 0;
    } else {
      subX[i] += 1;
      break;
    }
  }
  x.set(subX, 4);
}

export function halfDifficultyNumber(a: { leadingZeros: bigint; difficultyNumber: bigint }): {
  leadingZeros: bigint;
  difficultyNumber: bigint;
} {
  const new_a = a.difficultyNumber / 2n;
  if (new_a < 4096n) {
    return {
      leadingZeros: a.leadingZeros + 1n,
      difficultyNumber: new_a * 16n,
    };
  } else {
    return {
      leadingZeros: a.leadingZeros,
      difficultyNumber: new_a,
    };
  }
}

export function getDifficultyAdjustement(
  total_epoch_time: bigint,
  epoch_target: bigint,
): { numerator: bigint; denominator: bigint } {
  if (epoch_target / total_epoch_time >= 4 && epoch_target % total_epoch_time > 0) {
    return { numerator: 1n, denominator: 4n };
  } else if (total_epoch_time / epoch_target >= 4 && total_epoch_time % epoch_target > 0) {
    return { numerator: 4n, denominator: 1n };
  } else {
    return { numerator: total_epoch_time, denominator: epoch_target };
  }
}

export function calculateDifficultyNumber(
  a: { leadingZeros: bigint; difficultyNumber: bigint },
  numerator: bigint,
  denominator: bigint,
): { leadingZeros: bigint; difficultyNumber: bigint } {
  const new_padded_difficulty = (a.difficultyNumber * 16n * numerator) / denominator;

  const new_difficulty = new_padded_difficulty / 16n;

  if (new_padded_difficulty / 65536n == 0n) {
    if (a.leadingZeros >= 62n) {
      return { difficultyNumber: 4096n, leadingZeros: 62n };
    } else {
      return {
        difficultyNumber: new_padded_difficulty,
        leadingZeros: a.leadingZeros + 1n,
      };
    }
  } else if (new_difficulty / 65536n > 0n) {
    if (a.leadingZeros <= 2) {
      return { difficultyNumber: 65535n, leadingZeros: 2n };
    } else {
      return {
        difficultyNumber: new_difficulty / 16n,
        leadingZeros: a.leadingZeros - 1n,
      };
    }
  } else {
    return {
      difficultyNumber: new_difficulty,
      leadingZeros: a.leadingZeros,
    };
  }
}

export function calculateInterlink(
  currentHash: string,
  a: { leadingZeros: bigint; difficultyNumber: bigint },
  b: { leadingZeros: bigint; difficultyNumber: bigint },
  currentInterlink: Data[],
): Data[] {
  let b_half = halfDifficultyNumber(b);

  const interlink: Data[] = currentInterlink;

  let currentIndex = 0;

  while (
    b_half.leadingZeros < a.leadingZeros ||
    (b_half.leadingZeros == a.leadingZeros && b_half.difficultyNumber > a.difficultyNumber)
  ) {
    if (currentIndex < interlink.length) {
      interlink[currentIndex] = currentHash;
    } else {
      interlink.push(currentHash);
    }

    b_half = halfDifficultyNumber(b_half);
    currentIndex += 1;
  }

  return interlink;
}
