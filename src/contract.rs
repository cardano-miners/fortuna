use async_trait::async_trait;
use naumachia::{
    address::PolicyId,
    backend::Backend,
    ledger_client::LedgerClient,
    logic::{SCLogic, SCLogicError, SCLogicResult},
    scripts::{
        raw_policy_script::RawPolicy, raw_script::BlueprintFile,
        raw_validator_script::RawPlutusValidator, MintingPolicy, ScriptError, ScriptResult,
        ValidatorCode,
    },
    smart_contract::{SmartContract, SmartContractTrait},
    transaction::TxActions,
    trireme_ledger_client::get_trireme_ledger_client_from_file,
    values::Values,
};
use sha2::{Digest, Sha256};

use crate::{
    datums::State,
    error, mutations, queries,
    redeemers::{FortunaRedeemer, InputNonce, MintingState},
};

const BLUEPRINT: &str = include_str!("../plutus.json");
const SPEND_VALIDATOR_NAME: &str = "tuna.spend";
const MINT_VALIDATOR_NAME: &str = "tuna.mint";
pub const MASTER_TOKEN_NAME: &str = "lord tuna";
const TOKEN_NAME: &str = "TUNA";

#[derive(Debug, PartialEq, Eq)]
pub struct Fortuna;

#[async_trait]
impl SCLogic for Fortuna {
    type Endpoints = mutations::FortunaMutation;
    type Lookups = queries::FortunaQuery;
    type LookupResponses = queries::FortunaQueryResponse;
    type Datums = State;
    type Redeemers = FortunaRedeemer;

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

                let (spend, mint) =
                    tuna_validators().map_err(|e| SCLogicError::Endpoint(e.into()))?;

                let address = spend
                    .address(network)
                    .map_err(|e| SCLogicError::Endpoint(Box::new(e)))?;

                let mut values = Values::default();

                let policy_id =
                    PolicyId::NativeToken(mint.id().unwrap(), Some(MASTER_TOKEN_NAME.to_string()));

                values.add_one_value(&policy_id, 1);

                let actions = TxActions::v2()
                    .with_script_init(datum, values, address)
                    .with_mint(
                        1,
                        Some(MASTER_TOKEN_NAME.to_string()),
                        FortunaRedeemer::Mint(MintingState::Genesis),
                        Box::new(mint),
                    );

                Ok(actions)
            }
            Mine {
                block_data,
                redeemer,
            } => {
                let network = ledger_client
                    .network()
                    .await
                    .map_err(|err| SCLogicError::Endpoint(err.into()))?;

                let (spend, mint) =
                    tuna_validators().map_err(|e| SCLogicError::Endpoint(e.into()))?;

                let address = spend
                    .address(network)
                    .map_err(|e| SCLogicError::Endpoint(Box::new(e)))?;

                let outputs = ledger_client
                    .all_outputs_at_address(&address)
                    .await
                    .map_err(|err| SCLogicError::Endpoint(err.into()))?;

                let policy_id =
                    PolicyId::NativeToken(mint.id().unwrap(), Some(MASTER_TOKEN_NAME.to_string()));

                let input = outputs
                    .into_iter()
                    .find(|output| output.values().get(&policy_id).is_some())
                    .unwrap();

                let mut values = Values::default();

                values.add_one_value(&policy_id, 1);

                let amount = calculate_amount(block_data.block_number);

                let actions = TxActions::v2()
                    .with_script_init(block_data, values, address)
                    .with_script_redeem(input, FortunaRedeemer::Spend(redeemer), Box::new(spend))
                    .with_mint(
                        amount,
                        Some(TOKEN_NAME.to_string()),
                        FortunaRedeemer::Mint(MintingState::Mine),
                        Box::new(mint),
                    );

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

pub async fn mine(block_data: State, redeemer: InputNonce) -> error::Result<()> {
    mutate(mutations::FortunaMutation::Mine {
        block_data,
        redeemer,
    })
    .await
}

pub fn tuna_validators() -> ScriptResult<(
    RawPlutusValidator<State, FortunaRedeemer>,
    RawPolicy<FortunaRedeemer>,
)> {
    let blueprint: BlueprintFile = serde_json::from_str(BLUEPRINT)
        .map_err(|e| ScriptError::FailedToConstruct(e.to_string()))?;

    let spend_validator_blueprint =
        blueprint
            .get_validator(SPEND_VALIDATOR_NAME)
            .ok_or(ScriptError::FailedToConstruct(format!(
                "Validator not listed in Blueprint: {:?}",
                SPEND_VALIDATOR_NAME
            )))?;

    let mint_validator_blueprint =
        blueprint
            .get_validator(MINT_VALIDATOR_NAME)
            .ok_or(ScriptError::FailedToConstruct(format!(
                "Validator not listed in Blueprint: {:?}",
                MINT_VALIDATOR_NAME
            )))?;

    let raw_spend_script_validator = RawPlutusValidator::from_blueprint(spend_validator_blueprint)
        .map_err(|e| ScriptError::FailedToConstruct(e.to_string()))?;

    let raw_mint_script_validator = RawPolicy::from_blueprint(mint_validator_blueprint)
        .map_err(|e| ScriptError::FailedToConstruct(e.to_string()))?;

    Ok((raw_spend_script_validator, raw_mint_script_validator))
}

fn calculate_amount(block_number: u64) -> u64 {
    (50 * 100_000_000) / (2 ^ ((block_number - 1) / 210_000))
}
