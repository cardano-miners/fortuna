use crate::submitter::Submitter;
use crate::updater::Updater;
use crate::worker_manager::WorkerManager;
use tokio::sync::oneshot;

pub use crate::error::*;
pub mod submitter;
pub mod updater;
pub mod worker_manager;

pub mod error;

pub struct Miner<U, S, W> {
    updater: U,
    submitter: S,
    worker_manager: W,
}

pub struct Puzzle;
pub struct Answer;

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
                        self.submitter.submit(answer).await?;
                   } else {
                        todo!()
                   }
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
}
