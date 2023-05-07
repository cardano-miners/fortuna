#[tokio::main]
async fn main() -> miette::Result<()> {
    miette::set_panic_hook();

    fortuna::cmd::exec().await
}
