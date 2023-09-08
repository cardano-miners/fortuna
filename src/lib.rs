pub mod cmd;
pub mod contract;
pub mod datums;
pub mod error;
pub mod mutations;
pub mod queries;
pub mod redeemers;
pub mod util;

use crate::submitter::Submitter;
use crate::updater::Updater;
use crate::worker_manager::WorkerManager;
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

#[derive(Clone, Debug)]
pub struct Puzzle(String);
#[derive(Clone, Debug)]
pub struct Answer(String);

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
                        self.submitter.submit(answer).await?;
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
