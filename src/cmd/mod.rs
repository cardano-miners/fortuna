use clap::Parser;

pub mod genesis;
pub mod mine;

/// Fortuna miner
#[derive(Parser)]
pub enum Cmd {
    /// Start mining
    Mine,
    /// Setup the genesis block
    Genesis(genesis::Args),
}

pub async fn exec() -> miette::Result<()> {
    let cmd = Cmd::parse();

    match cmd {
        Cmd::Mine => mine::exec().await,
        Cmd::Genesis(args) => genesis::exec(args).await,
    }
}
