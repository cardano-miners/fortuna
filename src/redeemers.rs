use naumachia::scripts::raw_validator_script::plutus_data::PlutusData;
use serde::Deserialize;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
pub struct InputNonce {
    nonce: Vec<u8>,
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
