import type {
  DatumHash,
  RewardAddress,
  Transaction,
  TxHash,
  Provider,
  ProtocolParameters,
  Address,
  Credential,
  CostModels,
} from 'translucent-cardano';
import { Translucent } from 'translucent-cardano';

export class BrowserProvider implements Provider {
  private readonly baseUrl: string = '/api/provider';

  constructor() {}

  async getProtocolParameters(): Promise<ProtocolParameters> {
    const response = await fetch(`${this.baseUrl}/protocol-parameters`);

    const result = await response.json();

    // @ts-expect-error typecript is trippin
    const costModels: CostModels = Object.keys(result.costModels).reduce((acc, v) => {
      const version = v.split(':')[1].toUpperCase();

      const plutusVersion = 'Plutus' + version;

      return { ...acc, [plutusVersion]: result.costModels[v] };
    }, {});

    const [memNum, memDenom] = result.prices.memory.split('/');
    const [stepsNum, stepsDenom] = result.prices.steps.split('/');

    const params: ProtocolParameters = {
      minFeeA: parseInt(result.minFeeCoefficient),
      minFeeB: parseInt(result.minFeeConstant),
      maxTxSize: parseInt(result.maxTxSize),
      maxValSize: parseInt(result.maxValueSize),
      keyDeposit: BigInt(result.stakeKeyDeposit),
      poolDeposit: BigInt(result.poolDeposit),
      priceMem: [BigInt(memNum), BigInt(memDenom)],
      priceStep: [BigInt(stepsNum), BigInt(stepsDenom)],
      maxTxExMem: BigInt(result.maxExecutionUnitsPerTransaction.memory),
      maxTxExSteps: BigInt(result.maxExecutionUnitsPerTransaction.steps),
      coinsPerUtxoByte: BigInt(result.coinsPerUtxoByte),
      collateralPercentage: parseInt(result.collateralPercentage),
      maxCollateralInputs: parseInt(result.maxCollateralInputs),
      costModels,
    };

    return params;
  }

  async getUtxos(addressOrCredential: Address | Credential): Promise<UTxO[]> {
    throw new Error('Provider does not implement getUtxos');
  }

  getUtxosWithUnit(addressOrCredential: Address | Credential, unit: Unit): Promise<UTxO[]> {
    throw new Error('Provider does not implement getUtxosWithUnit');
  }

  async getUtxoByUnit(unit: Unit): Promise<UTxO> {
    throw new Error('Provider does not implement getUtxoByUnit');
  }

  async getUtxosByOutRef(outRefs: OutRef[]): Promise<UTxO[]> {
    throw new Error('Provider does not implement getUtxosByOutRef');
  }

  async getDelegation(rewardAddress: RewardAddress): Promise<Delegation> {
    throw new Error('Provider does not implement getDelegation');
  }

  async getDatum(datumHash: DatumHash): Promise<Datum> {
    throw new Error('Provider does not implement getDatum');
  }

  awaitTx(txHash: TxHash, checkInterval = 3000): Promise<boolean> {
    throw new Error(
      `Provider does not implement awaitTx(${txHash}, ${checkInterval}), use walletApi directly`,
    );
  }

  async submitTx(tx: Transaction): Promise<TxHash> {
    throw new Error(`Provider does not implement submitTx(${tx}), use walletApi directly`);
  }
}

export function createTranslucent(): Promise<Translucent> {
  return Translucent.new(new BrowserProvider());
}
