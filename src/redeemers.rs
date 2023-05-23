use naumachia::scripts::raw_validator_script::plutus_data::{Constr, PlutusData};
use serde::Deserialize;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
pub enum FortunaRedeemer {
    Spend(InputNonce),
    Mint(MintingState),
}

impl From<FortunaRedeemer> for PlutusData {
    fn from(value: FortunaRedeemer) -> Self {
        match value {
            FortunaRedeemer::Spend(nonce) => nonce.into(),
            FortunaRedeemer::Mint(state) => state.into(),
        }
    }
}

impl From<PlutusData> for FortunaRedeemer {
    fn from(value: PlutusData) -> Self {
        match &value {
            PlutusData::BoundedBytes(_) => FortunaRedeemer::Spend(value.into()),
            _ => FortunaRedeemer::Mint(value.into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
pub struct InputNonce {
    pub(crate) nonce: Vec<u8>,
}

impl From<InputNonce> for PlutusData {
    fn from(value: InputNonce) -> Self {
        PlutusData::BoundedBytes(value.nonce)
    }
}

impl From<PlutusData> for InputNonce {
    fn from(value: PlutusData) -> Self {
        let PlutusData::BoundedBytes(nonce) = value else {unreachable!()};

        InputNonce { nonce }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
pub enum MintingState {
    Mine,
    Genesis,
}

impl From<MintingState> for PlutusData {
    fn from(value: MintingState) -> Self {
        match value {
            MintingState::Genesis => PlutusData::Constr(Constr {
                constr: 1,
                fields: vec![],
            }),
            MintingState::Mine => PlutusData::Constr(Constr {
                constr: 0,
                fields: vec![],
            }),
        }
    }
}

impl From<PlutusData> for MintingState {
    fn from(value: PlutusData) -> Self {
        let PlutusData::Constr(constr) = value else {unreachable!()};

        if constr.constr == 0 {
            MintingState::Mine
        } else {
            MintingState::Genesis
        }
    }
}
