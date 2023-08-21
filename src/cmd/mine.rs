use std::time::Duration;

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
    contract::{self, tuna_validators, MASTER_TOKEN_NAME},
    datums::State,
    redeemers::{FortunaRedeemer, InputNonce},
};
use chrono::prelude::*;
use rand::random;
use sha2::{Digest, Sha256};

struct TargetState {
    pub block_number: u64,
    current_hash: Vec<u8>,
    leading_zeros: u8,
    difficulty_number: u16,
    epoch_time: u64,
    nonce: Vec<u8>,
}

const EPOCH_NUMBER: u64 = 2016;

const EPOCH_TARGET: u64 = 1_209_600;

pub const ON_CHAIN_HALF_TIME_RANGE: u64 = 90;

const PADDING: u64 = 16;

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

    let (tx, mut rx) = tokio::sync::mpsc::channel(1);

    let datum_thread = tokio::spawn(async move {
        let mut last_data = None;

        let ledger_client = get_trireme_ledger_client_from_file::<State, FortunaRedeemer>()
            .await
            .unwrap();

        loop {
            // TODO: snooze if error and try again
            let data = get_latest_datum(&ledger_client).await.unwrap();

            match last_data {
                Some(ld) if ld != data => {
                    tx.send(data.clone()).await.unwrap();
                    last_data = Some(data);
                }
                Some(_) => {
                    tokio::time::sleep(Duration::from_secs(10)).await;
                }
                None => {
                    tx.send(data.clone()).await.unwrap();
                    last_data = Some(data);
                }
            }
        }
    });

    loop {
        let datum = rx.recv().await.unwrap();

        tokio::select! {
            _ = mine(datum)=> {

            }

            datum = rx.recv() => {

            }


        }
    }

    loop {
        let data = get_latest_datum(&ledger_client).await?;

        match last_data {
            None => {
                last_data = Some(data.clone());

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

async fn mine(data: State) -> miette::Result<()> {
    let block_number = data.block_number;
    let difficulty_number = data.difficulty_number;
    let leading_zeros = data.leading_zeros;
    let epoch_time = data.epoch_time;
    let current_time = data.current_time;
    let interlink = data.interlink.clone();

    let current_difficulty_hash = get_difficulty_hash(difficulty_number, leading_zeros);

    let target_data_without_nonce: PlutusData = data.into();

    let PlutusData::Constr(Constr {  fields, .. }) = target_data_without_nonce
    else { unreachable!() };

    let fields: Vec<PlutusData> = fields.into_iter().take(5).collect();

    let (nonce, new_hash) = tokio::task::spawn_blocking(move || {
        let mut nonce: [u8; 32];

        let mut new_hash: Vec<u8>;

        loop {
            nonce = random::<[u8; 32]>();
            let mut fields = fields.clone();

            fields.push(PlutusData::BoundedBytes(nonce.to_vec()));

            let target_bytes = PlutusData::Constr(Constr { constr: 0, fields }).bytes();

            let hasher = Sha256::new_with_prefix(target_bytes);

            let hasher = Sha256::new_with_prefix(hasher.finalize());

            new_hash = hasher.finalize().to_vec();

            if new_hash.le(&current_difficulty_hash) {
                break;
            }
        }

        (nonce, new_hash)
    })
    .await
    .into_diagnostic()?;

    let redeemer = InputNonce {
        nonce: nonce.to_vec(),
    };

    let utc: DateTime<Utc> = Utc::now();
    let new_time_off_chain = utc.timestamp() as u64;
    let new_time_on_chain = new_time_off_chain + ON_CHAIN_HALF_TIME_RANGE;
    let new_slot_time = new_time_off_chain;

    let mut new_state = State {
        block_number: block_number + 1,
        current_hash: new_hash,
        leading_zeros,
        difficulty_number,
        epoch_time,
        current_time: new_time_on_chain,
        extra: 0,
        interlink,
    };

    if block_number % EPOCH_NUMBER == 0 {
        new_state.epoch_time = epoch_time + new_state.current_time - current_time;

        change_difficulty(&mut new_state);
    } else {
        // get cardano slot time
        new_state.epoch_time = epoch_time + new_state.current_time - current_time;
    }

    calculate_interlink(&mut new_state, difficulty_number, leading_zeros);

    contract::mine(new_state, redeemer, new_slot_time)
        .await
        .into_diagnostic()?;

    Ok(())
}

fn calculate_interlink(new_state: &mut State, difficulty_number: u16, leading_zeros: u8) {
    let epoch_half = EPOCH_TARGET / 2;
    let mut index = 0;

    let (mut half_difficulty_number, mut half_leading_zeros) =
        calculate_new_difficulty(epoch_half, difficulty_number.into(), leading_zeros);

    while get_difficulty_hash(half_difficulty_number, half_leading_zeros)
        .le(&new_state.current_hash)
    {
        if let Some(position) = new_state.interlink.get_mut(index) {
            *position = new_state.current_hash.clone();
        } else {
            new_state.interlink.push(new_state.current_hash.clone());
        }

        (half_difficulty_number, half_leading_zeros) = calculate_new_difficulty(
            epoch_half,
            half_difficulty_number.into(),
            half_leading_zeros,
        );

        index += 1;
    }
}

fn get_difficulty_hash(difficulty_number: u16, leading_zeros: u8) -> Vec<u8> {
    let mut difficulty_hash = [0_u8; 32];

    if leading_zeros % 2 == 0 {
        let byte_location = leading_zeros / 2;
        difficulty_hash[byte_location as usize] = (difficulty_number / 256) as u8;
        difficulty_hash[(byte_location + 1) as usize] = (difficulty_number % 256) as u8;
    } else {
        let byte_location = leading_zeros / 2;
        difficulty_hash[byte_location as usize] = (difficulty_number / 4096) as u8;
        difficulty_hash[(byte_location + 1) as usize] = ((difficulty_number / 16) % 4096) as u8;
        difficulty_hash[(byte_location + 2) as usize] = (difficulty_number % 16) as u8;
    }
    difficulty_hash.to_vec()
}

fn change_difficulty(state: &mut State) {
    let current_difficulty = state.difficulty_number as u64;
    let leading_zeros = state.leading_zeros;
    let total_epoch_time = state.epoch_time;

    let (new_difficulty, new_leading_zeros) =
        calculate_new_difficulty(total_epoch_time, current_difficulty, leading_zeros);

    state.difficulty_number = new_difficulty;
    state.leading_zeros = new_leading_zeros;
    state.epoch_time = 0;
}

fn calculate_new_difficulty(
    total_epoch_time: u64,
    current_difficulty: u64,
    leading_zeros: u8,
) -> (u16, u8) {
    let difficulty_adjustment = if EPOCH_TARGET / total_epoch_time >= 4 {
        (1, 4)
    } else if total_epoch_time / EPOCH_TARGET >= 4 {
        (4, 1)
    } else {
        (total_epoch_time, EPOCH_TARGET)
    };

    let new_padded_difficulty =
        current_difficulty * PADDING * difficulty_adjustment.0 / difficulty_adjustment.1;
    let new_difficulty = new_padded_difficulty / PADDING;

    if new_padded_difficulty / 65536 == 0 {
        if leading_zeros >= 30 {
            (4096, 60)
        } else {
            (new_padded_difficulty as u16, leading_zeros + 1)
        }
    } else if new_difficulty / 65536 > 0 {
        if leading_zeros <= 2 {
            (65535, 2)
        } else {
            ((new_difficulty / PADDING) as u16, leading_zeros - 1)
        }
    } else {
        (new_difficulty as u16, leading_zeros)
    }
}
