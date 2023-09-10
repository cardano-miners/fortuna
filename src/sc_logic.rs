use crate::mutations::FortunaMutation;
use crate::queries::{FortunaQuery, FortunaQueryResponse};
use crate::submitter::Submitter;
use crate::{
    contract::Fortuna, datums::State, redeemers::FortunaRedeemer, updater::Updater, Puzzle,
};
use crate::{Answer, Result};
use naumachia::smart_contract::SmartContractTrait;
use naumachia::{ledger_client::LedgerClient, smart_contract::SmartContract};
use std::sync::Arc;
use tokio::sync::watch::Sender;

#[derive(Clone, Debug)]
pub struct FortunaOffChain<LC: LedgerClient<State, FortunaRedeemer>> {
    contract: Arc<SmartContract<Fortuna, LC>>,
    update_frequency_millis: u64,
}

impl<LC: LedgerClient<State, FortunaRedeemer>> FortunaOffChain<LC> {
    pub fn new(contract: SmartContract<Fortuna, LC>, update_frequency_millis: u64) -> Self {
        Self {
            contract: Arc::new(contract),
            update_frequency_millis,
        }
    }
}

#[async_trait::async_trait]
impl<LC: LedgerClient<State, FortunaRedeemer> + 'static> Updater for FortunaOffChain<LC> {
    async fn start(&self, update_sender: Sender<Option<Puzzle>>) -> Result<()> {
        let contract = self.contract.clone();
        let update_frequency_millis = self.update_frequency_millis;
        tokio::task::spawn(async move {
            let mut last_known_puzzle = None;
            loop {
                match contract.lookup(FortunaQuery::LatestPuzzle).await {
                    Ok(FortunaQueryResponse::Puzzle(latest_puzzle)) => {
                        if Some(&latest_puzzle) != last_known_puzzle.as_ref() {
                            tracing::debug!("sending puzzle: {:?}", &latest_puzzle);
                            update_sender.send(Some(latest_puzzle.clone())).unwrap();
                            last_known_puzzle = Some(latest_puzzle);
                        }
                    }
                    Err(e) => {
                        tracing::error!("failed to get latest puzzle: {:?}", e);
                    }
                    _ => {
                        tracing::error!("unexpected response from contract");
                    }
                }
                tokio::time::sleep(std::time::Duration::from_millis(update_frequency_millis)).await;
            }
        });
        Ok(())
    }

    async fn stop(&self) -> Result<()> {
        Ok(())
    }
}

#[async_trait::async_trait]
impl<'a, LC: LedgerClient<State, FortunaRedeemer>> Submitter for FortunaOffChain<LC> {
    async fn submit(&self, answer: Answer) -> Result<()> {
        let res = self
            .contract
            .hit_endpoint(FortunaMutation::Answer(answer.clone()))
            .await?;
        Ok(res)
    }
}

#[cfg(test)]
mod tests {
    #![allow(non_snake_case)]

    use super::*;
    use crate::contract::{tuna_validators, MASTER_TOKEN_NAME};
    use naumachia::address::PolicyId;
    use naumachia::ledger_client::test_ledger_client::TestBackendsBuilder;
    use naumachia::scripts::raw_validator_script::plutus_data::{Constr, PlutusData};
    use naumachia::scripts::{MintingPolicy, ValidatorCode};
    use naumachia::{Address, Network};

    #[tokio::test]
    async fn update__can_get_most_recent_puzzle() {
        // given
        let (spend, mint) = tuna_validators().unwrap();
        let script_address = spend.address(Network::Testnet).unwrap();
        let master_token =
            PolicyId::NativeToken(mint.id().unwrap(), Some(MASTER_TOKEN_NAME.to_string()));
        let alice = Address::from_bech32("addr_test1qpuy2q9xel76qxdw8r29skldzc876cdgg9cugfg7mwh0zvpg3292mxuf3kq7nysjumlxjrlsfn9tp85r0l54l29x3qcs7nvyfm").unwrap();
        let current_hash = [1; 32].to_vec();

        let state = State {
            block_number: 0,
            difficulty_number: 0,
            leading_zeros: 0,
            epoch_time: 0,
            current_time: 0,
            extra: 0,
            interlink: vec![],
            current_hash: current_hash.clone(),
        };

        let backend = TestBackendsBuilder::new(&alice)
            .start_output(&script_address)
            .with_value(master_token, 1)
            .with_datum(state.clone())
            .finish_output()
            .build_in_memory();
        let contract = SmartContract::new(Fortuna, backend);
        let updater = FortunaOffChain::new(contract, 10);
        let (update_sender, update_receiver) = tokio::sync::watch::channel(None);

        // when
        updater.start(update_sender).await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;

        // then
        let PlutusData::Constr(Constr { fields, .. }) = PlutusData::from(state) else {
            unreachable!()
        };

        let expected_puzzle = Puzzle {
            current_difficulty_hash: current_hash,
            fields,
        };
        let actual_puzzle = update_receiver.borrow().to_owned().unwrap();
        assert_eq!(actual_puzzle, expected_puzzle);
    }
}
