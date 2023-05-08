use miette::IntoDiagnostic;

use crate::contract;

#[derive(clap::Args)]
pub struct Args {
    output_reference: String,
}

pub async fn exec(Args { output_reference }: Args) -> miette::Result<()> {
    let output_reference = hex::decode(output_reference).into_diagnostic()?;

    contract::genesis(output_reference)
        .await
        .into_diagnostic()?;

    Ok(())
}
