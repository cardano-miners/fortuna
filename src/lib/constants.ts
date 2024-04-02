import { fromText } from 'translucent-cardano';

export const V1_TUNA_POLICY_ID = '279f842c33eed9054b9e3c70cd6a3b32298259c24b78b895cb41d91a';
export const V1_TUNA_ASSET_NAME = fromText('TUNA');
export const V1_TUNA_SUBJECT = V1_TUNA_POLICY_ID + V1_TUNA_ASSET_NAME;
