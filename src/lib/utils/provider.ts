import type {
  DatumHash,
  RewardAddress,
  Transaction,
  TxHash,
  Provider,
  ProtocolParameters,
  Address,
  Credential,
  UTxO,
  Assets,
  Unit,
  Delegation,
  OutRef,
  Datum,
} from 'translucent-cardano';
import { PROTOCOL_PARAMETERS_DEFAULT, Translucent, fromHex, toHex, C } from 'translucent-cardano';

export class BrowserProvider implements Provider {
  private readonly baseUrl: string = '/api/provider';

  constructor() {}

  async getProtocolParameters(): Promise<ProtocolParameters> {
    return new Promise((resolve) => resolve(PROTOCOL_PARAMETERS_DEFAULT));
  }

  async getUtxos(addressOrCredential: Address | Credential): Promise<UTxO[]> {
    const isAddress = typeof addressOrCredential === 'string';
    const queryPredicate = isAddress ? addressOrCredential : addressOrCredential.hash;

    const response = await fetch(`${this.baseUrl}/utxos/${queryPredicate}?isAddress=${isAddress}`);

    const { utxos } = await response.json();

    return this.kupmiosUtxosToUtxos(utxos);
  }

  getUtxosWithUnit(addressOrCredential: Address | Credential, unit: Unit): Promise<UTxO[]> {
    throw new Error(
      `Provider does not implement getUtxosWithUnit: ${addressOrCredential}, ${unit}`,
    );
  }

  async getUtxoByUnit(unit: Unit): Promise<UTxO> {
    throw new Error(`Provider does not implement getUtxoByUnit: ${unit}`);
  }

  async getUtxosByOutRef(outRefs: OutRef[]): Promise<UTxO[]> {
    throw new Error(`Provider does not implement getUtxosByOutRef: ${outRefs}`);
  }

  async getDelegation(rewardAddress: RewardAddress): Promise<Delegation> {
    throw new Error(`Provider does not implement getDelegation: ${rewardAddress}`);
  }

  async getDatum(datumHash: DatumHash): Promise<Datum> {
    throw new Error(`Provider does not implement getDatum: ${datumHash}`);
  }

  awaitTx(txHash: TxHash, checkInterval = 3000): Promise<boolean> {
    throw new Error(
      `Provider does not implement awaitTx(${txHash}, ${checkInterval}), use walletApi directly`,
    );
  }

  async submitTx(tx: Transaction): Promise<TxHash> {
    throw new Error(`Provider does not implement submitTx(${tx}), use walletApi directly`);
  }

  private kupmiosUtxosToUtxos(utxos: unknown): Promise<UTxO[]> {
    return Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (utxos as any).map(async (utxo: any) => {
        return {
          txHash: utxo.transaction_id,
          outputIndex: parseInt(utxo.output_index),
          address: utxo.address,
          assets: (() => {
            const a: Assets = { lovelace: BigInt(utxo.value.coins) };
            Object.keys(utxo.value.assets).forEach((unit) => {
              a[unit.replace('.', '')] = BigInt(utxo.value.assets[unit]);
            });
            return a;
          })(),
          datumHash: utxo?.datum_type === 'hash' ? utxo.datum_hash : null,
          datum: utxo?.datum_type === 'inline' ? await this.getDatum(utxo.datum_hash) : null,
          scriptRef:
            utxo.script_hash &&
            (await (async () => {
              const response = await fetch(`${this.baseUrl}/scripts/${utxo.script_hash}`);

              const { script, language } = await response.json();

              if (language === 'native') {
                return { type: 'Native', script };
              } else if (language === 'plutus:v1') {
                return {
                  type: 'PlutusV1',
                  script: toHex(C.PlutusV1Script.new(fromHex(script)).to_bytes()),
                };
              } else if (language === 'plutus:v2') {
                return {
                  type: 'PlutusV2',
                  script: toHex(C.PlutusV2Script.new(fromHex(script)).to_bytes()),
                };
              }
            })()),
        } as UTxO;
      }),
    );
  }
}

export function createTranslucent(): Promise<Translucent> {
  return Translucent.new(new BrowserProvider());
}
