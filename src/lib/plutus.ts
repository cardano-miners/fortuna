// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { type Script } from '@blaze-cardano/core';
import { applyParamsToScript, cborToScript } from '@blaze-cardano/uplc';
import { type PlutusData } from '@blaze-cardano/core';

export interface NewSpendMine {
  new (
    tunav2MintingPolicy: string,
    initUtxoRef: { transactionId: { hash: string }; outputIndex: bigint },
  ): Script;
  datum: PlutusData;
  redeemer:
    | {
        MinePow: [
          string,
          (
            | { Pkh: [string, PlutusData] }
            | { Nft: { policy: string; name: string; outputIndex: bigint; extra: PlutusData } }
          ),
          Array<
            | { Branch: { skip: bigint; neighbors: string } }
            | { Fork: { skip: bigint; neighbor: { nibble: bigint; prefix: string; root: string } } }
            | { Leaf: { skip: bigint; key: string; value: string } }
          >,
        ];
      }
    | 'Upgrade'
    | 'Nominate';
}

export const NewSpendMine = Object.assign(
  function (
    tunav2MintingPolicy: string,
    initUtxoRef: { transactionId: { hash: string }; outputIndex: bigint },
  ) {
    return cborToScript(
      applyParamsToScript('', [tunav2MintingPolicy, initUtxoRef], {
        dataType: 'list',
        items: [
          { dataType: 'bytes' },
          {
            title: 'OutputReference',
            description:
              'An `OutputReference` is a unique reference to an output on-chain. The `output_index`\n corresponds to the position in the output list of the transaction (identified by its id)\n that produced that output',
            anyOf: [
              {
                title: 'OutputReference',
                dataType: 'constructor',
                index: 0,
                fields: [
                  {
                    title: 'transactionId',
                    description:
                      "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
                    anyOf: [
                      {
                        title: 'TransactionId',
                        dataType: 'constructor',
                        index: 0,
                        fields: [{ dataType: 'bytes', title: 'hash' }],
                      },
                    ],
                  },
                  { dataType: 'integer', title: 'outputIndex' },
                ],
              },
            ],
          },
        ],
      } as any),
      'PlutusV2',
    );
  },
  { datum: { title: 'Data', description: 'Any Plutus data.' } },
  {
    redeemer: {
      title: 'MineAction',
      anyOf: [
        {
          title: 'MinePow',
          dataType: 'constructor',
          index: 0,
          fields: [
            { dataType: 'bytes' },
            {
              anyOf: [
                {
                  title: 'Pkh',
                  dataType: 'constructor',
                  index: 0,
                  fields: [{ dataType: 'bytes' }, { description: 'Any Plutus data.' }],
                },
                {
                  title: 'Nft',
                  dataType: 'constructor',
                  index: 1,
                  fields: [
                    { dataType: 'bytes', title: 'policy' },
                    { dataType: 'bytes', title: 'name' },
                    { dataType: 'integer', title: 'outputIndex' },
                    { title: 'extra', description: 'Any Plutus data.' },
                  ],
                },
              ],
            },
            {
              dataType: 'list',
              items: {
                title: 'ProofStep',
                description:
                  'We distinguish three kind of proof steps: Branch, Fork and Leaf. Each step\n contains a `skip` value which corresponds to the length of the common prefix\n at that particular level.\n\n The details of each level is documented [in the wiki :: Proof Format](https://github.com/aiken-lang/merkle-patricia-forestry/wiki/Proof-format).',
                anyOf: [
                  {
                    title: 'Branch',
                    dataType: 'constructor',
                    index: 0,
                    fields: [
                      { dataType: 'integer', title: 'skip' },
                      { dataType: 'bytes', title: 'neighbors' },
                    ],
                  },
                  {
                    title: 'Fork',
                    dataType: 'constructor',
                    index: 1,
                    fields: [
                      { dataType: 'integer', title: 'skip' },
                      {
                        title: 'neighbor',
                        description:
                          'A neighbor node used in a proof. See [Proof](#Proof) for details.',
                        anyOf: [
                          {
                            title: 'Neighbor',
                            dataType: 'constructor',
                            index: 0,
                            fields: [
                              { dataType: 'integer', title: 'nibble' },
                              { dataType: 'bytes', title: 'prefix' },
                              { dataType: 'bytes', title: 'root' },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    title: 'Leaf',
                    dataType: 'constructor',
                    index: 2,
                    fields: [
                      { dataType: 'integer', title: 'skip' },
                      { dataType: 'bytes', title: 'key' },
                      { dataType: 'bytes', title: 'value' },
                    ],
                  },
                ],
              },
            },
          ],
        },
        { title: 'Upgrade', dataType: 'constructor', index: 1, fields: [] },
        { title: 'Nominate', dataType: 'constructor', index: 2, fields: [] },
      ],
    },
  },
) as unknown as NewSpendMine;

export interface SimplerforkNftFork {
  new (
    initUtxoRef: { transactionId: { hash: string }; outputIndex: bigint },
    fortunaV1Hash: string,
  ): Script;
  redeemer:
    | { HardFork: { lockOutputIndex: bigint } }
    | { Lock: { lockOutputIndex: bigint; lockingAmount: bigint } };
}

export const SimplerforkNftFork = Object.assign(
  function (
    initUtxoRef: { transactionId: { hash: string }; outputIndex: bigint },
    fortunaV1Hash: string,
  ) {
    return cborToScript(
      applyParamsToScript('', [initUtxoRef, fortunaV1Hash], {
        dataType: 'list',
        items: [
          {
            title: 'OutputReference',
            description:
              'An `OutputReference` is a unique reference to an output on-chain. The `output_index`\n corresponds to the position in the output list of the transaction (identified by its id)\n that produced that output',
            anyOf: [
              {
                title: 'OutputReference',
                dataType: 'constructor',
                index: 0,
                fields: [
                  {
                    title: 'transactionId',
                    description:
                      "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
                    anyOf: [
                      {
                        title: 'TransactionId',
                        dataType: 'constructor',
                        index: 0,
                        fields: [{ dataType: 'bytes', title: 'hash' }],
                      },
                    ],
                  },
                  { dataType: 'integer', title: 'outputIndex' },
                ],
              },
            ],
          },
          { dataType: 'bytes' },
        ],
      } as any),
      'PlutusV2',
    );
  },

  {
    redeemer: {
      title: 'NftForkAction',
      anyOf: [
        {
          title: 'HardFork',
          description:
            'This action is only run once and it sets up the ability to convert v1 tuna tokens to v2 tuna tokens',
          dataType: 'constructor',
          index: 0,
          fields: [{ dataType: 'integer', title: 'lockOutputIndex' }],
        },
        {
          title: 'Lock',
          dataType: 'constructor',
          index: 1,
          fields: [
            { dataType: 'integer', title: 'lockOutputIndex' },
            { dataType: 'integer', title: 'lockingAmount' },
          ],
        },
      ],
    },
  },
) as unknown as SimplerforkNftFork;

export interface SimplerforkFork {
  new (
    initUtxoRef: { transactionId: { hash: string }; outputIndex: bigint },
    fortunaV1Hash: string,
  ): Script;
  _datum: { blockHeight: bigint; currentLockedTuna: bigint };
  _redeemer: { wrapper: PlutusData };
}

export const SimplerforkFork = Object.assign(
  function (
    initUtxoRef: { transactionId: { hash: string }; outputIndex: bigint },
    fortunaV1Hash: string,
  ) {
    return cborToScript(
      applyParamsToScript('', [initUtxoRef, fortunaV1Hash], {
        dataType: 'list',
        items: [
          {
            title: 'OutputReference',
            description:
              'An `OutputReference` is a unique reference to an output on-chain. The `output_index`\n corresponds to the position in the output list of the transaction (identified by its id)\n that produced that output',
            anyOf: [
              {
                title: 'OutputReference',
                dataType: 'constructor',
                index: 0,
                fields: [
                  {
                    title: 'transactionId',
                    description:
                      "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
                    anyOf: [
                      {
                        title: 'TransactionId',
                        dataType: 'constructor',
                        index: 0,
                        fields: [{ dataType: 'bytes', title: 'hash' }],
                      },
                    ],
                  },
                  { dataType: 'integer', title: 'outputIndex' },
                ],
              },
            ],
          },
          { dataType: 'bytes' },
        ],
      } as any),
      'PlutusV2',
    );
  },
  {
    _datum: {
      title: 'LockState',
      description:
        "Simplified fork with only 2 actions. HardFork current tuna v1 version to v2 version\n and Lock action to lock v1 tokens and mint v2 tokens. This is simpler version that does not have miners'\n input in the hardfork action. This is mainly because there are no current miners anyway.\n Ensures that maximum lockable tuna is equal to emitted tuna at block height",
      anyOf: [
        {
          title: 'LockState',
          dataType: 'constructor',
          index: 0,
          fields: [
            { dataType: 'integer', title: 'blockHeight' },
            { dataType: 'integer', title: 'currentLockedTuna' },
          ],
        },
      ],
    },
  },
  {
    _redeemer: {
      title: 'Wrapped Redeemer',
      description:
        'A redeemer wrapped in an extra constructor to make multi-validator detection possible on-chain.',
      anyOf: [{ dataType: 'constructor', index: 1, fields: [{ description: 'Any Plutus data.' }] }],
    },
  },
) as unknown as SimplerforkFork;

export interface Tunav1Dummy {
  new (): Script;
  _state: {
    nonce: string;
    blockNumber: bigint;
    currentHash: string;
    leadingZeros: bigint;
    targetNumber: bigint;
    epochTime: bigint;
  };
  _rdmr: string;
}

export const Tunav1Dummy = Object.assign(
  function () {
    return cborToScript('', 'PlutusV2');
  },
  {
    _state: {
      title: 'TargetState',
      anyOf: [
        {
          title: 'TargetState',
          dataType: 'constructor',
          index: 0,
          fields: [
            { dataType: 'bytes', title: 'nonce' },
            { dataType: 'integer', title: 'blockNumber' },
            { dataType: 'bytes', title: 'currentHash' },
            { dataType: 'integer', title: 'leadingZeros' },
            { dataType: 'integer', title: 'targetNumber' },
            { dataType: 'integer', title: 'epochTime' },
          ],
        },
      ],
    },
  },
  { _rdmr: { dataType: 'bytes' } },
) as unknown as Tunav1Dummy;

export interface Tunav1Mint {
  new (utxoRef: { transactionId: { hash: string }; outputIndex: bigint }): Script;
  state: 'Mine' | 'Genesis';
}

export const Tunav1Mint = Object.assign(
  function (utxoRef: { transactionId: { hash: string }; outputIndex: bigint }) {
    return cborToScript(
      applyParamsToScript('', [utxoRef], {
        dataType: 'list',
        items: [
          {
            title: 'OutputReference',
            description:
              'An `OutputReference` is a unique reference to an output on-chain. The `output_index`\n corresponds to the position in the output list of the transaction (identified by its id)\n that produced that output',
            anyOf: [
              {
                title: 'OutputReference',
                dataType: 'constructor',
                index: 0,
                fields: [
                  {
                    title: 'transactionId',
                    description:
                      "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
                    anyOf: [
                      {
                        title: 'TransactionId',
                        dataType: 'constructor',
                        index: 0,
                        fields: [{ dataType: 'bytes', title: 'hash' }],
                      },
                    ],
                  },
                  { dataType: 'integer', title: 'outputIndex' },
                ],
              },
            ],
          },
        ],
      } as any),
      'PlutusV2',
    );
  },

  {
    state: {
      title: 'MintingAction',
      anyOf: [
        { title: 'Mine', dataType: 'constructor', index: 0, fields: [] },
        { title: 'Genesis', dataType: 'constructor', index: 1, fields: [] },
      ],
    },
  },
) as unknown as Tunav1Mint;

export interface Tunav1Spend {
  new (utxoRef: { transactionId: { hash: string }; outputIndex: bigint }): Script;
  state: {
    blockNumber: bigint;
    currentHash: string;
    leadingZeros: bigint;
    targetNumber: bigint;
    epochTime: bigint;
    currentPosixTime: bigint;
    extra: PlutusData;
    interlink: Array<PlutusData>;
  };
  nonce: { wrapper: string };
}

export const Tunav1Spend = Object.assign(
  function (utxoRef: { transactionId: { hash: string }; outputIndex: bigint }) {
    return cborToScript(
      applyParamsToScript('', [utxoRef], {
        dataType: 'list',
        items: [
          {
            title: 'OutputReference',
            description:
              'An `OutputReference` is a unique reference to an output on-chain. The `output_index`\n corresponds to the position in the output list of the transaction (identified by its id)\n that produced that output',
            anyOf: [
              {
                title: 'OutputReference',
                dataType: 'constructor',
                index: 0,
                fields: [
                  {
                    title: 'transactionId',
                    description:
                      "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
                    anyOf: [
                      {
                        title: 'TransactionId',
                        dataType: 'constructor',
                        index: 0,
                        fields: [{ dataType: 'bytes', title: 'hash' }],
                      },
                    ],
                  },
                  { dataType: 'integer', title: 'outputIndex' },
                ],
              },
            ],
          },
        ],
      } as any),
      'PlutusV2',
    );
  },
  {
    state: {
      title: 'State',
      description: 'State Data stored on chain.\n Used by the validator to check the next state.',
      anyOf: [
        {
          title: 'State',
          dataType: 'constructor',
          index: 0,
          fields: [
            { dataType: 'integer', title: 'blockNumber' },
            { dataType: 'bytes', title: 'currentHash' },
            { dataType: 'integer', title: 'leadingZeros' },
            { dataType: 'integer', title: 'targetNumber' },
            { dataType: 'integer', title: 'epochTime' },
            { dataType: 'integer', title: 'currentPosixTime' },
            { title: 'extra', description: 'Any Plutus data.' },
            {
              dataType: 'list',
              items: { title: 'Data', description: 'Any Plutus data.' },
              title: 'interlink',
            },
          ],
        },
      ],
    },
  },
  {
    nonce: {
      title: 'Wrapped Redeemer',
      description:
        'A redeemer wrapped in an extra constructor to make multi-validator detection possible on-chain.',
      anyOf: [{ dataType: 'constructor', index: 1, fields: [{ dataType: 'bytes' }] }],
    },
  },
) as unknown as Tunav1Spend;

export interface Tunav2Mine {
  new (tunav2MintingPolicy: string): Script;
  datum: {
    blockNumber: bigint;
    currentHash: string;
    leadingZeros: bigint;
    targetNumber: bigint;
    epochTime: bigint;
    currentPosixTime: bigint;
    merkleRoot: string;
  };
  redeemer:
    | {
        MinePow: [
          string,
          (
            | { Pkh: [string, PlutusData] }
            | { Nft: { policy: string; name: string; outputIndex: bigint; extra: PlutusData } }
          ),
          Array<
            | { Branch: { skip: bigint; neighbors: string } }
            | { Fork: { skip: bigint; neighbor: { nibble: bigint; prefix: string; root: string } } }
            | { Leaf: { skip: bigint; key: string; value: string } }
          >,
        ];
      }
    | 'Upgrade';
}

export const Tunav2Mine = Object.assign(
  function (tunav2MintingPolicy: string) {
    return cborToScript(
      applyParamsToScript('', [tunav2MintingPolicy], {
        dataType: 'list',
        items: [{ dataType: 'bytes' }],
      } as any),
      'PlutusV2',
    );
  },
  {
    datum: {
      title: 'Statev2',
      description: 'Statev2 Data stored on chain.\n Used by the validator to check the next state.',
      anyOf: [
        {
          title: 'Statev2',
          dataType: 'constructor',
          index: 0,
          fields: [
            { dataType: 'integer', title: 'blockNumber' },
            { dataType: 'bytes', title: 'currentHash' },
            { dataType: 'integer', title: 'leadingZeros' },
            { dataType: 'integer', title: 'targetNumber' },
            { dataType: 'integer', title: 'epochTime' },
            { dataType: 'integer', title: 'currentPosixTime' },
            { dataType: 'bytes', title: 'merkleRoot' },
          ],
        },
      ],
    },
  },
  {
    redeemer: {
      title: 'MineAction',
      anyOf: [
        {
          title: 'MinePow',
          dataType: 'constructor',
          index: 0,
          fields: [
            { dataType: 'bytes' },
            {
              anyOf: [
                {
                  title: 'Pkh',
                  dataType: 'constructor',
                  index: 0,
                  fields: [{ dataType: 'bytes' }, { description: 'Any Plutus data.' }],
                },
                {
                  title: 'Nft',
                  dataType: 'constructor',
                  index: 1,
                  fields: [
                    { dataType: 'bytes', title: 'policy' },
                    { dataType: 'bytes', title: 'name' },
                    { dataType: 'integer', title: 'outputIndex' },
                    { title: 'extra', description: 'Any Plutus data.' },
                  ],
                },
              ],
            },
            {
              dataType: 'list',
              items: {
                title: 'ProofStep',
                description:
                  'We distinguish three kind of proof steps: Branch, Fork and Leaf. Each step\n contains a `skip` value which corresponds to the length of the common prefix\n at that particular level.\n\n The details of each level is documented [in the wiki :: Proof Format](https://github.com/aiken-lang/merkle-patricia-forestry/wiki/Proof-format).',
                anyOf: [
                  {
                    title: 'Branch',
                    dataType: 'constructor',
                    index: 0,
                    fields: [
                      { dataType: 'integer', title: 'skip' },
                      { dataType: 'bytes', title: 'neighbors' },
                    ],
                  },
                  {
                    title: 'Fork',
                    dataType: 'constructor',
                    index: 1,
                    fields: [
                      { dataType: 'integer', title: 'skip' },
                      {
                        title: 'neighbor',
                        description:
                          'A neighbor node used in a proof. See [Proof](#Proof) for details.',
                        anyOf: [
                          {
                            title: 'Neighbor',
                            dataType: 'constructor',
                            index: 0,
                            fields: [
                              { dataType: 'integer', title: 'nibble' },
                              { dataType: 'bytes', title: 'prefix' },
                              { dataType: 'bytes', title: 'root' },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    title: 'Leaf',
                    dataType: 'constructor',
                    index: 2,
                    fields: [
                      { dataType: 'integer', title: 'skip' },
                      { dataType: 'bytes', title: 'key' },
                      { dataType: 'bytes', title: 'value' },
                    ],
                  },
                ],
              },
            },
          ],
        },
        { title: 'Upgrade', dataType: 'constructor', index: 1, fields: [] },
      ],
    },
  },
) as unknown as Tunav2Mine;

export interface Tunav2Tuna {
  new (fortunaV1Hash: PlutusData, forkScriptHash: PlutusData): Script;
  redeemer:
    | 'Genesis'
    | { MineTuna: [{ transactionId: { hash: string }; outputIndex: bigint }, bigint] }
    | 'Redeem'
    | { NominateUpgrade: [string, bigint] }
    | { VotingToken: [{ transactionId: { hash: string }; outputIndex: bigint }] }
    | 'BurnToken'
    | {
        FinalizeNomination: [
          { transactionId: { hash: string }; outputIndex: bigint },
          { transactionId: { hash: string }; outputIndex: bigint },
          bigint,
          bigint,
        ];
      };
}

export const Tunav2Tuna = Object.assign(
  function (fortunaV1Hash: PlutusData, forkScriptHash: PlutusData) {
    return cborToScript(
      applyParamsToScript('', [fortunaV1Hash, forkScriptHash], {
        dataType: 'list',
        items: [
          { title: 'Data', description: 'Any Plutus data.' },
          { title: 'Data', description: 'Any Plutus data.' },
        ],
      } as any),
      'PlutusV2',
    );
  },

  {
    redeemer: {
      title: 'TunaAction',
      anyOf: [
        { title: 'Genesis', dataType: 'constructor', index: 0, fields: [] },
        {
          title: 'MineTuna',
          dataType: 'constructor',
          index: 1,
          fields: [
            {
              description:
                'An `OutputReference` is a unique reference to an output on-chain. The `output_index`\n corresponds to the position in the output list of the transaction (identified by its id)\n that produced that output',
              anyOf: [
                {
                  title: 'OutputReference',
                  dataType: 'constructor',
                  index: 0,
                  fields: [
                    {
                      title: 'transactionId',
                      description:
                        "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
                      anyOf: [
                        {
                          title: 'TransactionId',
                          dataType: 'constructor',
                          index: 0,
                          fields: [{ dataType: 'bytes', title: 'hash' }],
                        },
                      ],
                    },
                    { dataType: 'integer', title: 'outputIndex' },
                  ],
                },
              ],
            },
            { dataType: 'integer' },
          ],
        },
        { title: 'Redeem', dataType: 'constructor', index: 2, fields: [] },
        {
          title: 'NominateUpgrade',
          dataType: 'constructor',
          index: 3,
          fields: [{ dataType: 'bytes' }, { dataType: 'integer' }],
        },
        {
          title: 'VotingToken',
          dataType: 'constructor',
          index: 4,
          fields: [
            {
              description:
                'An `OutputReference` is a unique reference to an output on-chain. The `output_index`\n corresponds to the position in the output list of the transaction (identified by its id)\n that produced that output',
              anyOf: [
                {
                  title: 'OutputReference',
                  dataType: 'constructor',
                  index: 0,
                  fields: [
                    {
                      title: 'transactionId',
                      description:
                        "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
                      anyOf: [
                        {
                          title: 'TransactionId',
                          dataType: 'constructor',
                          index: 0,
                          fields: [{ dataType: 'bytes', title: 'hash' }],
                        },
                      ],
                    },
                    { dataType: 'integer', title: 'outputIndex' },
                  ],
                },
              ],
            },
          ],
        },
        { title: 'BurnToken', dataType: 'constructor', index: 5, fields: [] },
        {
          title: 'FinalizeNomination',
          dataType: 'constructor',
          index: 6,
          fields: [
            {
              description:
                'An `OutputReference` is a unique reference to an output on-chain. The `output_index`\n corresponds to the position in the output list of the transaction (identified by its id)\n that produced that output',
              anyOf: [
                {
                  title: 'OutputReference',
                  dataType: 'constructor',
                  index: 0,
                  fields: [
                    {
                      title: 'transactionId',
                      description:
                        "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
                      anyOf: [
                        {
                          title: 'TransactionId',
                          dataType: 'constructor',
                          index: 0,
                          fields: [{ dataType: 'bytes', title: 'hash' }],
                        },
                      ],
                    },
                    { dataType: 'integer', title: 'outputIndex' },
                  ],
                },
              ],
            },
            {
              description:
                'An `OutputReference` is a unique reference to an output on-chain. The `output_index`\n corresponds to the position in the output list of the transaction (identified by its id)\n that produced that output',
              anyOf: [
                {
                  title: 'OutputReference',
                  dataType: 'constructor',
                  index: 0,
                  fields: [
                    {
                      title: 'transactionId',
                      description:
                        "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
                      anyOf: [
                        {
                          title: 'TransactionId',
                          dataType: 'constructor',
                          index: 0,
                          fields: [{ dataType: 'bytes', title: 'hash' }],
                        },
                      ],
                    },
                    { dataType: 'integer', title: 'outputIndex' },
                  ],
                },
              ],
            },
            { dataType: 'integer' },
            { dataType: 'integer' },
          ],
        },
      ],
    },
  },
) as unknown as Tunav2Tuna;

export interface Tunav2Govern {
  new (fortunaV1Hash: PlutusData, forkScriptHash: PlutusData): Script;
  dat:
    | {
        Nominated: {
          scriptHash: string;
          forCount: bigint;
          antiScriptHash: string;
          againstCount: bigint;
          deadline: bigint;
        };
      }
    | { Mining: { scriptHash: string; minerSupportCount: bigint; blockHeightDeadline: bigint } };
  rdmr: {
    wrapper:
      | 'TokenVoteFor'
      | 'TokenVoteAgainst'
      | { MinerVoteFor: { outputIndex: bigint; blockNumber: bigint } }
      | { TransitionState: { blockNumber: bigint } };
  };
}

export const Tunav2Govern = Object.assign(
  function (fortunaV1Hash: PlutusData, forkScriptHash: PlutusData) {
    return cborToScript(
      applyParamsToScript('', [fortunaV1Hash, forkScriptHash], {
        dataType: 'list',
        items: [
          { title: 'Data', description: 'Any Plutus data.' },
          { title: 'Data', description: 'Any Plutus data.' },
        ],
      } as any),
      'PlutusV2',
    );
  },
  {
    dat: {
      title: 'TunaUpgradeProcess',
      anyOf: [
        {
          title: 'Nominated',
          dataType: 'constructor',
          index: 0,
          fields: [
            { dataType: 'bytes', title: 'scriptHash' },
            { dataType: 'integer', title: 'forCount' },
            { dataType: 'bytes', title: 'antiScriptHash' },
            { dataType: 'integer', title: 'againstCount' },
            { dataType: 'integer', title: 'deadline' },
          ],
        },
        {
          title: 'Mining',
          dataType: 'constructor',
          index: 1,
          fields: [
            { dataType: 'bytes', title: 'scriptHash' },
            { dataType: 'integer', title: 'minerSupportCount' },
            { dataType: 'integer', title: 'blockHeightDeadline' },
          ],
        },
      ],
    },
  },
  {
    rdmr: {
      title: 'Wrapped Redeemer',
      description:
        'A redeemer wrapped in an extra constructor to make multi-validator detection possible on-chain.',
      anyOf: [
        {
          dataType: 'constructor',
          index: 1,
          fields: [
            {
              anyOf: [
                { title: 'TokenVoteFor', dataType: 'constructor', index: 0, fields: [] },
                { title: 'TokenVoteAgainst', dataType: 'constructor', index: 1, fields: [] },
                {
                  title: 'MinerVoteFor',
                  dataType: 'constructor',
                  index: 2,
                  fields: [
                    { dataType: 'integer', title: 'outputIndex' },
                    { dataType: 'integer', title: 'blockNumber' },
                  ],
                },
                {
                  title: 'TransitionState',
                  dataType: 'constructor',
                  index: 3,
                  fields: [{ dataType: 'integer', title: 'blockNumber' }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
) as unknown as Tunav2Govern;

export interface UnusedForkNftFork {
  new (
    initUtxoRef: { transactionId: { hash: string }; outputIndex: bigint },
    fortunaV1Hash: string,
  ): Script;
  redeemer: PlutusData;
}

export const UnusedForkNftFork = Object.assign(
  function (
    initUtxoRef: { transactionId: { hash: string }; outputIndex: bigint },
    fortunaV1Hash: string,
  ) {
    return cborToScript(
      applyParamsToScript('', [initUtxoRef, fortunaV1Hash], {
        dataType: 'list',
        items: [
          {
            title: 'OutputReference',
            description:
              'An `OutputReference` is a unique reference to an output on-chain. The `output_index`\n corresponds to the position in the output list of the transaction (identified by its id)\n that produced that output',
            anyOf: [
              {
                title: 'OutputReference',
                dataType: 'constructor',
                index: 0,
                fields: [
                  {
                    title: 'transactionId',
                    description:
                      "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
                    anyOf: [
                      {
                        title: 'TransactionId',
                        dataType: 'constructor',
                        index: 0,
                        fields: [{ dataType: 'bytes', title: 'hash' }],
                      },
                    ],
                  },
                  { dataType: 'integer', title: 'outputIndex' },
                ],
              },
            ],
          },
          { dataType: 'bytes' },
        ],
      } as any),
      'PlutusV2',
    );
  },

  { redeemer: { title: 'Data', description: 'Any Plutus data.' } },
) as unknown as UnusedForkNftFork;

export interface UnusedForkFork {
  new (
    initUtxoRef: { transactionId: { hash: string }; outputIndex: bigint },
    fortunaV1Hash: string,
  ): Script;
  _datum: PlutusData;
  _redeemer: { wrapper: PlutusData };
}

export const UnusedForkFork = Object.assign(
  function (
    initUtxoRef: { transactionId: { hash: string }; outputIndex: bigint },
    fortunaV1Hash: string,
  ) {
    return cborToScript(
      applyParamsToScript('', [initUtxoRef, fortunaV1Hash], {
        dataType: 'list',
        items: [
          {
            title: 'OutputReference',
            description:
              'An `OutputReference` is a unique reference to an output on-chain. The `output_index`\n corresponds to the position in the output list of the transaction (identified by its id)\n that produced that output',
            anyOf: [
              {
                title: 'OutputReference',
                dataType: 'constructor',
                index: 0,
                fields: [
                  {
                    title: 'transactionId',
                    description:
                      "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
                    anyOf: [
                      {
                        title: 'TransactionId',
                        dataType: 'constructor',
                        index: 0,
                        fields: [{ dataType: 'bytes', title: 'hash' }],
                      },
                    ],
                  },
                  { dataType: 'integer', title: 'outputIndex' },
                ],
              },
            ],
          },
          { dataType: 'bytes' },
        ],
      } as any),
      'PlutusV2',
    );
  },
  { _datum: { title: 'Data', description: 'Any Plutus data.' } },
  {
    _redeemer: {
      title: 'Wrapped Redeemer',
      description:
        'A redeemer wrapped in an extra constructor to make multi-validator detection possible on-chain.',
      anyOf: [{ dataType: 'constructor', index: 1, fields: [{ description: 'Any Plutus data.' }] }],
    },
  },
) as unknown as UnusedForkFork;
