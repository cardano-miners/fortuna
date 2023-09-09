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

pub struct FortunaOffChain<'a, LC: LedgerClient<State, FortunaRedeemer>> {
    contract: Arc<SmartContract<'a, Fortuna, LC>>,
    update_frequency_millis: u64,
}

impl<'a, LC: LedgerClient<State, FortunaRedeemer>> FortunaOffChain<'a, LC> {
    pub fn new(contract: SmartContract<'a, Fortuna, LC>, update_frequency_millis: u64) -> Self {
        Self {
            contract: Arc::new(contract),
            update_frequency_millis,
        }
    }
}

#[async_trait::async_trait]
impl<LC: LedgerClient<State, FortunaRedeemer>> Updater for FortunaOffChain<'static, LC> {
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
impl<'a, LC: LedgerClient<State, FortunaRedeemer>> Submitter for FortunaOffChain<'a, LC> {
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
    use super::*;

    // TODO: Add tests using test ledger to verify that the submitter and updater code works as expected
}
