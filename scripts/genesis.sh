#!/bin/bash
aiken blueprint apply -v tuna.mint $1 > genesis/plutus.json

cargo run -- genesis $1