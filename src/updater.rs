use crate::error::Result;
use crate::Puzzle;

#[async_trait::async_trait]
pub trait Updater {
    async fn start(&self, update_sender: tokio::sync::watch::Sender<Option<Puzzle>>) -> Result<()>;
    async fn stop(&self) -> Result<()>;
}
