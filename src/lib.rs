pub mod cmd;
pub mod contract;
pub mod datums;
pub mod error;
pub mod mutations;
pub mod queries;
pub mod redeemers;
pub mod util;

pub mod sc_logic;

use crate::submitter::Submitter;
use crate::updater::Updater;
use crate::worker_manager::WorkerManager;
use naumachia::scripts::raw_validator_script::plutus_data::PlutusData;
use tokio::sync::oneshot;

pub use crate::error::*;
pub mod submitter;
pub mod updater;
pub mod worker_manager;

#[cfg(test)]
mod tests;

pub struct Miner<U, S, W> {
    updater: U,
    submitter: S,
    worker_manager: W,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Puzzle {
    current_difficulty_hash: Vec<u8>,
    fields: Vec<PlutusData>,
}
#[derive(Clone, Debug)]
pub struct Answer {
    #[allow(unused)]
    nonce: [u8; 32],
    new_hash: Vec<u8>,
}

impl<U: Updater, S: Submitter, W: WorkerManager> Miner<U, S, W> {
    pub fn new(updater: U, submitter: S, worker_manager: W) -> Self {
        Self {
            updater,
            submitter,
            worker_manager,
        }
    }

    pub async fn run(&self, mut shutdown: oneshot::Receiver<()>) -> Result<()> {
        let (update_sender, update_receiver) = tokio::sync::watch::channel(None);
        let (answer_sender, mut answer_receiver) = tokio::sync::mpsc::unbounded_channel();
        self.worker_manager
            .start_workers(update_receiver, answer_sender)
            .await?;
        self.updater.start(update_sender).await?;

        loop {
            tokio::select! {
                _ = &mut shutdown => {
                    self.worker_manager.stop_workers().await?;
                    self.updater.stop().await?;
                    break;
                }
                maybe_answer = answer_receiver.recv() => {
                   if let Some(answer) = maybe_answer {
                        // TODO: can we start working on the next puzzle while we submit the answer?
                        match self.submitter.submit(answer).await {
                            Ok(()) => {
                                tracing::debug!("answer submitted");
                            }
                            Err(e) => {
                                tracing::error!("failed to submit answer: {:?}", e);
                            }
                        }
                   } else {
                        tracing::debug!("no answer received");
                        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
                   }
                }
            }
        }

        Ok(())
    }
}
