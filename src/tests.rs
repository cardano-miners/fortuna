#![allow(non_snake_case)]

use super::*;
use std::ops::Deref;
use tokio::sync::mpsc::UnboundedSender;
use tokio::sync::watch::Receiver;
use tokio::sync::watch::Sender;

struct MockUpdater {
    puzzle: Puzzle,
}

#[async_trait::async_trait]
impl Updater for MockUpdater {
    async fn start(&self, update_sender: Sender<Option<Puzzle>>) -> Result<()> {
        tracing::debug!("sending puzzle: {:?}", self.puzzle);
        update_sender.send(Some(self.puzzle.clone())).unwrap();
        Ok(())
    }

    async fn stop(&self) -> Result<()> {
        tracing::debug!("stopping updater");
        Ok(())
    }
}

struct MockSubmitter {
    answer_channel: UnboundedSender<Answer>,
}

#[async_trait::async_trait]
impl Submitter for MockSubmitter {
    async fn submit(&self, answer: Answer) -> Result<()> {
        tracing::debug!("submitting answer: {:?}", answer);
        self.answer_channel.send(answer).unwrap();
        Ok(())
    }
}

struct MockWorkerManager;

#[async_trait::async_trait]
impl WorkerManager for MockWorkerManager {
    async fn start_workers(
        &self,
        mut update_receiver: Receiver<Option<Puzzle>>,
        answer_sender: UnboundedSender<Answer>,
    ) -> Result<()> {
        tokio::task::spawn(async move {
            while update_receiver.changed().await.is_ok() {
                let maybe_puzzle = update_receiver.borrow();
                if let Some(puzzle) = maybe_puzzle.deref() {
                    tracing::debug!("received puzzle: {:?}", puzzle);
                    answer_sender.send(Answer(puzzle.0.clone())).unwrap();
                }
            }
        });
        Ok(())
    }

    async fn stop_workers(&self) -> Result<()> {
        Ok(())
    }
}

#[tokio::test]
async fn run__updater_puzzle_is_given_to_workers_and_appropriate_answer_given_to_submitter() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .try_init()
        .unwrap();
    let word = "puzzle";
    let updater = MockUpdater {
        puzzle: Puzzle(word.to_string()),
    };
    let (answer_sender, mut answer_receiver) = tokio::sync::mpsc::unbounded_channel();
    let submitter = MockSubmitter {
        answer_channel: answer_sender,
    };
    let worker_manager = MockWorkerManager;
    let miner = Miner::new(updater, submitter, worker_manager);
    let (shutdown_sender, shutdown_receiver) = tokio::sync::oneshot::channel();
    tokio::task::spawn(async move {
        miner.run(shutdown_receiver).await.unwrap();
    });
    let answer = answer_receiver.recv().await.unwrap();
    assert_eq!(answer.0, word);
    shutdown_sender.send(()).unwrap();
}
