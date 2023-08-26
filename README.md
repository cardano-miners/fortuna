# Fortuna

Bitcoin style proof of work in smart contract form.

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
