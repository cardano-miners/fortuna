<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/aiken-lang/fortuna/main/static/assets/logo_white/Fortuna_circle_horizontal.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/aiken-lang/fortuna/main/static/assets/logo_razzy_blue/Fortuna_circle_horizontal.png">
  <img alt="Fortuna" src="https://raw.githubusercontent.com/aiken-lang/fortuna/main/static/assets/logo_razzy_blue/Fortuna_circle_horizontal.png" height="150">
</picture>
<hr />
    <h2 align="center" style="border-bottom: none">Bitcoin style proof of work in smart contract form</h2>

[![Licence](https://img.shields.io/github/license/aiken-lang/fortuna)](https://github.com/aiken-lang/fortuna/blob/main/LICENSE)
[![Tests](https://github.com/aiken-lang/fortuna/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/aiken-lang/fortuna/actions/workflows/tests.yml)

<hr/>
</div>

## Explorer

Thanks to [@QCPOLstakepool](https://github.com/QCPOLstakepool) we have an explorer.

Check it out [here](https://fortuna-explorer.stakepool.quebec/home).

## Mining $TUNA

> The current miner is naive and a better implementation is coming soon.

### Requirements

- [Deno](https://deno.land/manual@v1.36.3/getting_started/installation)
- [Kupo](https://cardanosolutions.github.io/kupo/)
- [Ogmios](https://github.com/CardanoSolutions/ogmios)

> You can easily get access to Kupo and Ogmios with
> [Demeter](https://demeter.run). Once you have a project in Demeter you can
> connect Ogmios and Kupo extensions for mainnet. Make sure to toggle
> `Expose http port` in each extensions' settings.

#### Environment variables

Once you have URLs for Kupo and Ogmios, create a `.env` file in the root of the
project with the following content:

```
KUPO_URL="https://<Kupo URL>"
OGMIOS_URL="wss://<Ogmios URL>"
```

#### Wallet

You'll need to create a wallet for the miner which can be done with the
following command:

```sh
deno task cli init
```

Then run the following command to get the miner address:

```sh
deno task cli address
```

You'll need to fund this address with some $ADA to pay for transaction fees.

### Running

After everything is setup, you can run the miner with the following command:

```sh
deno task cli mine
```

## Policy

The policy for the TUNA token is
`279f842c33eed9054b9e3c70cd6a3b32298259c24b78b895cb41d91a`
