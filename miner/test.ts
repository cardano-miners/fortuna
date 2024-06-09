import colors from 'colors/safe';
import {
  applyParamsToScript,
  Constr,
  Credential,
  Emulator,
  generatePrivateKey,
  getAddressDetails,
  Lucid,
  PROTOCOL_PARAMETERS_DEFAULT,
  Script,
  TxSigned,
} from 'lucid-cardano';

import { printExecutionDetails, readValidator } from './utils';

export type TestContext = {
  lucid: Lucid;
  emulator: Emulator;
  minerPaymentCredential?: Credential;
  minerAddr: string;
  minerPk: string;
  initOutRef: Constr<bigint | Constr<string>>;
  validator: Script;
  refAddr: string;
};

const validator = readValidator();

export async function test(name: string, fn: (ctx: TestContext) => Promise<TxSigned>) {
  const minerPk = generatePrivateKey();
  const refPk = generatePrivateKey();

  const l = await Lucid.new(undefined, 'Preprod');

  const minerAddr = await l.selectWalletFromPrivateKey(minerPk).wallet.address();

  const refAddr = await l.selectWalletFromPrivateKey(refPk).wallet.address();

  const { paymentCredential: minerPaymentCred } = getAddressDetails(minerAddr);

  const emulator = new Emulator(
    [
      {
        address: minerAddr,
        assets: {
          lovelace: BigInt(1e14),
        },
      },
      { address: refAddr, assets: { lovelace: BigInt(1e14) } },
    ],
    {
      ...PROTOCOL_PARAMETERS_DEFAULT,
    },
  );

  const lucid = await Lucid.new(emulator);

  lucid.selectWalletFromPrivateKey(minerPk);

  const txInit = await lucid
    .newTx()
    .payToAddress(minerAddr, {
      lovelace: 1000001n,
    })
    .complete();

  const signedRef1 = await txInit.sign().complete();

  await signedRef1.submit();

  emulator.awaitBlock(16);

  const initOutputRef = new Constr(0, [new Constr(0, [txInit.toHash()]), 0n]);

  validator.script = applyParamsToScript(validator.script, [initOutputRef]);

  const initUTXOs = await lucid.utxosAt(minerAddr);

  const txRef = await lucid
    .newTx()
    .collectFrom(initUTXOs.filter((u) => u.outputIndex === 1))
    .payToAddressWithData(
      refAddr,
      { scriptRef: validator },
      {
        lovelace: 100000000n,
      },
    )
    .complete({ coinSelection: false });

  const signedRef2 = await txRef.sign().complete();

  await signedRef2.submit();

  emulator.awaitBlock(16);

  const txSigned = await fn({
    lucid,
    emulator,
    minerPaymentCredential: minerPaymentCred,
    minerAddr,
    minerPk,
    initOutRef: initOutputRef,
    validator,
    refAddr,
  });

  printExecutionDetails(txSigned, name);
}

export async function testFail(name: string, fn: (ctx: TestContext) => Promise<TxSigned>) {
  try {
    await test(name, fn);

    const err = `
  ${colors.bold(colors.magenta(name))} - ${colors.red('failed')}`;

    console.log(err);
  } catch (e) {
    const error = e
      .split('\n')
      .map((l: string) => `\n    ${l}`)
      .join('');

    const message = `
  ${colors.bold(colors.magenta(name))} - ${colors.green('passed')}\n${error}`;

    console.log(message);
  }
}
