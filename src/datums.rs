use std::vec;

use naumachia::scripts::raw_validator_script::plutus_data::{BigInt, Constr, PlutusData};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct State {
    pub block_number: u64,
    pub current_hash: Vec<u8>,
    pub leading_zeros: u8,
    pub difficulty_number: u16,
    pub epoch_time: u64,
    pub current_time: u64,
    pub extra: u32,
    pub interlink: Vec<Vec<u8>>,
}

impl State {
    pub fn genesis(current_hash: Vec<u8>, current_time: u64) -> Self {
        State {
            block_number: 0,
            current_hash,
            leading_zeros: 4,
            difficulty_number: 65535,
            epoch_time: 0,
            current_time,
            extra: 0,
            interlink: vec![],
        }
    }
}

impl From<State> for PlutusData {
    fn from(value: State) -> Self {
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
                PlutusData::BigInt(BigInt::Int {
                    neg: false,
                    val: value.current_time,
                }),
                PlutusData::BigInt(BigInt::Int {
                    neg: false,
                    val: value.extra as u64,
                }),
                PlutusData::Array(
                    value
                        .interlink
                        .into_iter()
                        .map(PlutusData::BoundedBytes)
                        .collect(),
                ),
            ],
        })
    }
}
impl From<PlutusData> for State {
    fn from(value: PlutusData) -> Self {
        let PlutusData::Constr(Constr { fields, .. }) = value else {unreachable!()};

        let mut fields = fields.into_iter();

        let PlutusData::BigInt(BigInt::Int { val: block_number, .. }) = fields.next().unwrap() else {unreachable!()};

        let PlutusData::BoundedBytes(current_hash) = fields.next().unwrap() else {unreachable!()};

        let PlutusData::BigInt(BigInt::Int { val: leading_zeros, .. }) = fields.next().unwrap() else {unreachable!()};
        let PlutusData::BigInt(BigInt::Int { val: difficulty_number, .. }) = fields.next().unwrap() else {unreachable!()};
        let PlutusData::BigInt(BigInt::Int { val: epoch_time, .. }) = fields.next().unwrap() else {unreachable!()};
        let PlutusData::BigInt(BigInt::Int { val: current_time, .. }) = fields.next().unwrap() else {unreachable!()};
        let PlutusData::BigInt(BigInt::Int { val: extra, .. }) = fields.next().unwrap() else {unreachable!()};

        let PlutusData::Array(hashes) = fields.next().unwrap() else {unreachable!()};

        let interlink = hashes
            .into_iter()
            .map(|hash| {
                let PlutusData::BoundedBytes(bytes) = hash else {unreachable!()};

                bytes
            })
            .collect();

        State {
            block_number,
            current_hash,
            leading_zeros: leading_zeros as u8,
            difficulty_number: difficulty_number as u16,
            epoch_time,
            current_time,
            extra: extra as u32,
            interlink,
        }
    }
}
