use crate::error::Result;
use crate::{Answer, Puzzle};
use tokio::sync::mpsc::UnboundedSender;
use tokio::sync::watch::Receiver;

#[async_trait::async_trait]
pub trait WorkerManager {
    async fn start_workers(
        &self,
        update_receiver: Receiver<Option<Puzzle>>,
        answer_sender: UnboundedSender<Answer>,
    ) -> Result<()>;
    async fn stop_workers(&self) -> Result<()>;
}
