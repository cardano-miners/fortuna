use crate::{datums::State, redeemers::InputNonce, Answer};

pub enum FortunaMutation {
    Genesis {
        output_reference: Vec<u8>,
    },
    Mine {
        block_data: State,
        redeemer: InputNonce,
        current_slot_time: u64,
    },
    Answer(Answer),
}
