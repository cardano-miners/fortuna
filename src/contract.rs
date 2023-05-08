use async_trait::async_trait;
use naumachia::{
    backend::Backend,
    ledger_client::LedgerClient,
    logic::{SCLogic, SCLogicResult},
    smart_contract::{SmartContract, SmartContractTrait},
    transaction::TxActions,
    trireme_ledger_client::get_trireme_ledger_client_from_file,
};
use sha2::{Digest, Sha256};

use crate::{error, mutations, queries};

#[derive(Debug, PartialEq, Eq)]
pub struct Fortuna;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct State {
    block_number: u64,
    current_hash: Vec<u8>,
    leading_zeros: u8,
    difficulty_number: u16,
    epoch_time: u64,
    extra: u32,
    interlink: Vec<Vec<u8>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct InputNonce {
    nonce: Vec<u8>,
}

#[async_trait]
impl SCLogic for Fortuna {
    type Endpoints = mutations::FortunaMutation;
    type Lookups = queries::FortunaQuery;
    type LookupResponses = queries::FortunaQueryResponse;
    type Datums = State;
    type Redeemers = InputNonce;

    async fn handle_endpoint<Record: LedgerClient<Self::Datums, Self::Redeemers>>(
        endpoint: Self::Endpoints,
        ledger_client: &Record,
    ) -> SCLogicResult<TxActions<Self::Datums, Self::Redeemers>> {
        use mutations::FortunaMutation::*;

        match endpoint {
            Genesis { output_reference } => {
                let mut hasher = Sha256::new();

                hasher.update(output_reference);

                let current_hash = hasher.finalize();

                let datum = State {
                    block_number: 0,
                    current_hash,
                    leading_zeros: 4,
                    difficulty_number: 65535,
                    epoch_time: todo!(),
                    extra: 0,
                    interlink: vec![],
                };

                let actions = TxActions::v2().with_script_init(datum, values, address);

                Ok(actions)
            }
        }
    }

    async fn lookup<Record: LedgerClient<Self::Datums, Self::Redeemers>>(
        query: Self::Lookups,
        ledger_client: &Record,
    ) -> SCLogicResult<Self::LookupResponses> {
        todo!()
    }
}

pub async fn mutate(mutation: mutations::FortunaMutation) -> error::Result<()> {
    let ledger_client = get_trireme_ledger_client_from_file().await?;
    let backend = Backend::new(ledger_client);
    let contract = SmartContract::new(&Fortuna, &backend);

    contract.hit_endpoint(mutation).await?;

    Ok(())
}

pub async fn genesis(output_reference: Vec<u8>) -> error::Result<()> {
    mutate(mutations::FortunaMutation::Genesis { output_reference }).await
}
