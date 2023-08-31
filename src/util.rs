use tokio::{sync::watch, task::JoinHandle};

pub enum TaskError {
    Aborted,
    JoinError,
}

/// Runs a task while listening to a watch channel, and cancel the task if the channel changes
/// during execution.
pub async fn cancel_on_change<T, R>(
    task: JoinHandle<T>,
    mut rx: watch::Receiver<R>,
) -> Result<T, TaskError> {
    let abort_handle = task.abort_handle();

    tokio::select! {
        _ = rx.changed() => {
            abort_handle.abort();
            Err(TaskError::Aborted)
        }
        t = task => {
            match t {
                Ok(t) => Ok(t),
                Err(_) => Err(TaskError::JoinError)
            }
        }
    }
}
