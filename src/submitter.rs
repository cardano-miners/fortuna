use crate::error::Result;
use crate::Answer;

#[async_trait::async_trait]
pub trait Submitter {
    async fn submit(&self, answer: Answer) -> Result<()>;
}
