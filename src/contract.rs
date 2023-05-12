use async_trait::async_trait;
use naumachia::{
    backend::Backend,
    ledger_client::LedgerClient,
    logic::{SCLogic, SCLogicError, SCLogicResult},
    scripts::{
        raw_script::BlueprintFile, raw_validator_script::RawPlutusValidator, ScriptError,
        ScriptResult, ValidatorCode,
    },
    smart_contract::{SmartContract, SmartContractTrait},
    transaction::TxActions,
    trireme_ledger_client::get_trireme_ledger_client_from_file,
};
use sha2::{Digest, Sha256};

use crate::{datums::State, error, mutations, queries, redeemers::InputNonce};

const BLUEPRINT: &str = include_str!("../plutus.json");
const VALIDATOR_NAME: &str = "tuna.spend";

#[derive(Debug, PartialEq, Eq)]
pub struct Fortuna;

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

                let datum = State::genesis(current_hash.to_vec());

                let network = ledger_client
                    .network()
                    .await
                    .map_err(|err| SCLogicError::Endpoint(err.into()))?;

                let validator =
                    tuna_spend_validator().map_err(|e| SCLogicError::Endpoint(e.into()))?;

                let address = validator
                    .address(network)
                    .map_err(|e| SCLogicError::Endpoint(Box::new(e)))?;

                let actions = TxActions::v2().with_script_init(datum, Default::default(), address);

                Ok(actions)
            }
        }
    }

    async fn lookup<Record: LedgerClient<Self::Datums, Self::Redeemers>>(
        _query: Self::Lookups,
        _ledger_client: &Record,
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

pub fn tuna_spend_validator() -> ScriptResult<RawPlutusValidator<State, InputNonce>> {
    let blueprint: BlueprintFile = serde_json::from_str(BLUEPRINT)
        .map_err(|e| ScriptError::FailedToConstruct(e.to_string()))?;

    let validator_blueprint =
        blueprint
            .get_validator(VALIDATOR_NAME)
            .ok_or(ScriptError::FailedToConstruct(format!(
                "Validator not listed in Blueprint: {:?}",
                VALIDATOR_NAME
            )))?;

    let raw_script_validator = RawPlutusValidator::from_blueprint(validator_blueprint)
        .map_err(|e| ScriptError::FailedToConstruct(e.to_string()))?;

    Ok(raw_script_validator)
}
