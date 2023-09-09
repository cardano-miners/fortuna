use crate::Puzzle;

pub enum FortunaQuery {
    CurrentBlock,
    LatestPuzzle,
}

pub enum FortunaQueryResponse {
    Block,
    Puzzle(Puzzle),
}
