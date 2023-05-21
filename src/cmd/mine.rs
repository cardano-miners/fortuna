use miette::IntoDiagnostic;
use naumachia::{
    address::PolicyId,
    ledger_client::LedgerClient,
    scripts::{
        raw_validator_script::plutus_data::{BigInt, Constr, PlutusData},
        MintingPolicy, ValidatorCode,
    },
    trireme_ledger_client::get_trireme_ledger_client_from_file,
};

use crate::{
    contract::{tuna_validators, MASTER_TOKEN_NAME},
    datums::State,
    redeemers::FortunaRedeemer,
};
use rand::random;
use sha2::{Sha256, Digest};

struct TargetState {
    pub block_number: u64,
    current_hash: Vec<u8>,
    leading_zeros: u8,
    difficulty_number: u16,
    epoch_time: u64,
    nonce: Vec<u8>,
}

impl From<TargetState> for PlutusData {
    fn from(value: TargetState) -> Self {
        PlutusData::Constr(Constr {
            constr: 121,
            fields: vec![
                PlutusData::BigInt(BigInt::Int {
                    neg: false,
                    val: value.block_number,
                }),
                PlutusData::BoundedBytes(value.current_hash),
                PlutusData::BigInt(BigInt::Int {
                    neg: false,
                    val: value.leading_zeros as u64,
                }),
                PlutusData::BigInt(BigInt::Int {
                    neg: false,
                    val: value.difficulty_number as u64,
                }),
                PlutusData::BigInt(BigInt::Int {
                    neg: false,
                    val: value.epoch_time,
                }),
                PlutusData::BoundedBytes(value.nonce),
            ],
        })
    }
}

pub async fn exec() -> miette::Result<()> {
    let mut last_data = None;

    let mut handle = None;

    let ledger_client = get_trireme_ledger_client_from_file::<State, FortunaRedeemer>()
        .await
        .into_diagnostic()?;

    loop {
        let data = get_latest_datum(&ledger_client).await?;

        match last_data {
            None => {
                handle = Some(tokio::spawn(async move { mine(data).await }).abort_handle());
            }
            Some(ld) if ld != data => {
                if let Some(handle) = handle.take() {
                    handle.abort();
                }

                let worker_data = data.clone();

                handle = Some(tokio::spawn(async move { mine(worker_data).await }).abort_handle());

                last_data = Some(data)
            }
            _ => (),
        }
    }
}

async fn get_latest_datum<LC>(ledger_client: &LC) -> miette::Result<State>
where
    LC: LedgerClient<State, FortunaRedeemer>,
{
    let network = ledger_client.network().await.into_diagnostic()?;

    let (spend, mint) = tuna_validators().into_diagnostic()?;

    let address = spend.address(network).into_diagnostic()?;

    let outputs = ledger_client
        .all_outputs_at_address(&address)
        .await
        .into_diagnostic()?;

    let policy_id = PolicyId::NativeToken(mint.id().unwrap(), Some(MASTER_TOKEN_NAME.to_string()));

    let input = outputs
        .into_iter()
        .find(|output| output.values().get(&policy_id).is_some())
        .unwrap();

    let datum = input.typed_datum().unwrap();

    Ok(datum)
}

async fn mine(data: State) {
    // Do some work here.
    // ...

    let new_block_number = data.block_number + 1;

    let target_data_without_nonce: PlutusData = data.into();

    let PlutusData::Constr(Constr {  fields, .. }) = target_data_without_nonce 
    else { unreachable!() };

    let fields: Vec<PlutusData> = fields.into_iter().take(5).collect();

    loop {
        let nonce = random::<[u8; 32]>();
        let mut fields = fields.clone();

        fields.push(PlutusData::BoundedBytes(nonce.to_vec()));

        let target_state = PlutusData::Constr(Constr { constr: 0, fields });

        let mut hasher = Sha256::new();

        
    }
}
