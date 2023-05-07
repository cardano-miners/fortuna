use miette::IntoDiagnostic;
use naumachia::{
    ledger_client::LedgerClient, trireme_ledger_client::get_trireme_ledger_client_from_file,
};

#[derive(clap::Args)]
pub struct Args {
    tx_hash: String,
    output_index: u16,
}

pub async fn exec(
    Args {
        tx_hash,
        output_index,
    }: Args,
) -> miette::Result<()> {
    let ledger_client = get_trireme_ledger_client_from_file::<(), ()>()
        .await
        .into_diagnostic()?;

    Ok(())
}
