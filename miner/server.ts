BigInt.prototype.toJSON = function () {
    return Number(this.toString());
};

import { loadSync } from "https://deno.land/std@0.199.0/dotenv/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import {
    applyParamsToScript,
    Constr,
    Data,
    fromHex,
    fromText,
    generateSeedPhrase,
    Kupmios,
    Lucid,
    Script,
    sha256,
    toHex,
} from "https://deno.land/x/lucid@0.10.1/mod.ts";
import {
    calculateDifficultyNumber,
    calculateInterlink,
    getDifficulty,
    getDifficultyAdjustement,
    incrementU8Array,
    readValidator,
} from "./utils.ts";

loadSync({ export: true, allowEmptyValues: true });

// Excludes datum field because it is not needed
// and it's annoying to type.
type Genesis = {
    validator: string;
    validatorHash: string;
    validatorAddress: string;
    boostrapHash: string;
    outRef: { txHash: string; index: number };
};

const delay = (ms: number | undefined) =>
    new Promise((res) => setTimeout(res, ms));

const mine = new Command()
    .description("Start the miner")
    .env("KUPO_URL=<value:string>", "Kupo URL", { required: true })
    .env("OGMIOS_URL=<value:string>", "Ogmios URL", { required: true })
    .option("-p, --preview", "Use testnet")
    .action(async ({ preview, ogmiosUrl, kupoUrl }) => {
        const genesisFile = Deno.readTextFileSync(
            `genesis/${preview ? "preview" : "mainnet"}.json`,
        );

        const { validatorHash, validatorAddress }: Genesis = JSON
            .parse(
                genesisFile,
            );
        console.log(validatorAddress)
        const provider = new Kupmios(kupoUrl, ogmiosUrl);


        const lucid = await Lucid.new(provider, preview ? "Preview" : "Mainnet");

        lucid.selectWalletFromSeed(Deno.readTextFileSync("seed.txt"));

        let validatorUTXOs = await lucid.utxosAt(validatorAddress);

        async function submit(answer: FoundAnswer, state: Constr<
            string | bigint | string[]
        >) {
            const realTimeNow = Number((Date.now() / 1000).toFixed(0)) * 1000 - 60000;
            console.log("answer diff: " + answer.difficulty, answer.zeroes)
            console.log("real diff: " + JSON.stringify(getDifficulty(answer.answer)))
            console.log("old state: " + JSON.stringify(state))
            const interlink = calculateInterlink(toHex(answer.answer), { leadingZeros: answer.zeroes, difficulty_number: answer.difficulty}, {
                leadingZeros: state.fields[2] as bigint,
                difficulty_number: state.fields[3] as bigint,
            }, state.fields[7] as string[]);

            let epoch_time = (state.fields[4] as bigint) +
                BigInt(90000 + realTimeNow) -
                (state.fields[5] as bigint);

            let difficulty_number = state.fields[3] as bigint;
            let leading_zeros = state.fields[2] as bigint;


            if (
                state.fields[0] as bigint % 2016n === 0n &&
                state.fields[0] as bigint > 0
            ) {
                const adjustment = getDifficultyAdjustement(epoch_time, 1_209_600_000n);

                epoch_time = 0n;

                const new_difficulty = calculateDifficultyNumber(
                    {
                        leadingZeros: state.fields[2] as bigint,
                        difficulty_number: state.fields[3] as bigint,
                    },
                    adjustment.numerator,
                    adjustment.denominator,
                );

                difficulty_number = new_difficulty.difficulty_number;
                leading_zeros = new_difficulty.leadingZeros;
            }
            // calculateDifficultyNumber();

            const postDatum = new Constr(0, [
                (state.fields[0] as bigint) + 1n,
                toHex(answer.answer),
                leading_zeros,
                difficulty_number,
                epoch_time,
                BigInt(90000 + realTimeNow),
                BigInt(0),
                interlink,
            ]);
            console.log(postDatum)
            const outDat = Data.to(postDatum);

            console.log(`Found next datum: ${outDat}`);

            const mintTokens = { [validatorHash + fromText("TUNA")]: 5000000000n };
            const masterToken = { [validatorHash + fromText("lord tuna")]: 1n };
            try {
                const readUtxo = await lucid.utxosByOutRef([{
                    txHash:
                        "01751095ea408a3ebe6083b4de4de8a24b635085183ab8a2ac76273ef8fff5dd",
                    outputIndex: 0,
                }]);
                const txMine = await lucid
                    .newTx()
                    .collectFrom(
                        [validatorOutRef],
                        Data.to(new Constr(1, [toHex(answer.nonce)])),
                    )
                    .payToAddressWithData(
                        validatorAddress,
                        { inline: outDat },
                        masterToken,
                    )
                    .mintAssets(mintTokens, Data.to(new Constr(0, [])))
                    .readFrom(readUtxo)
                    .validTo(realTimeNow + 180000)
                    .validFrom(realTimeNow)
                    .complete();

                const signed = await txMine.sign().complete();

                await signed.submit();

                console.log(`TX HASH: ${signed.toHash()}`);
                console.log("Waiting for confirmation...");

                // // await lucid.awaitTx(signed.toHash());
            } catch (e) {
                console.log(e);
            }

        }



        // END SUBMIT FUNCTION


        let validatorOutRef = validatorUTXOs.find(
            (u) => u.assets[validatorHash + fromText("lord tuna")],
        )!;

        let validatorState = validatorOutRef.datum!;

        let state = Data.from(validatorState) as Constr<
            string | bigint | string[]
        >;

        let nonce = new Uint8Array(16);

        crypto.getRandomValues(nonce);

        console.log("Mining...");



        const update = async () => {
            console.log("Trying to update!");
            validatorUTXOs = await lucid.utxosAt(validatorAddress);

            validatorOutRef = validatorUTXOs.find(
                (u) => u.assets[validatorHash + fromText("lord tuna")],
            )!;

            if (validatorState !== validatorOutRef.datum!) {
                console.log("NEW STATE!!!!")
                validatorState = validatorOutRef.datum!;

                state = Data.from(validatorState) as Constr<
                    string | bigint | string[]
                >;
            }

            await delay(500)
            await update()
        }

        update()

        Deno.serve({ port: 8008 }, serveHttp);

        async function serveHttp(request: Request): Promise<Response> {
            const body = `Your user-agent is:\n\n${
                request.headers.get("user-agent") ?? "Unknown"
            }`

            if (request.url.match("submit")) {
                let answer = (await request.json())
                if (!answer.nonce || !answer.answer || !answer.difficulty || !answer.zeroes) {
                    throw ("NO")
                }

                answer = answer as FoundAnswer

                submit(answer, state)

                return new Response(body, { status: 200 });
            } else {
                const body = `Your user-agent is:\n\n${
                    request.headers.get("user-agent") ?? "Unknown"
                }`

                let fixed = {
                    fields: [
                        {bytes: toHex(nonce)},
                        {int: state.fields[0] as bigint},
                        {bytes: state.fields[1]},
                        {int: state.fields[2] as bigint},
                        {int: state.fields[3] as bigint},
                        {int: state.fields[4] as bigint},
                    ],
                    constructor: state.index
                }

                return new Response(JSON.stringify(fixed), { status: 200 });
            }

        }
    });

type FoundAnswer = {
    nonce: Uint8Array,
    answer: Uint8Array
    difficulty: bigint,
    zeroes: bigint,
}





await new Command()
    .name("fortuna")
    .description("Fortuna miner")
    .version("0.0.1")
    .command("mine", mine)
    .parse(Deno.args);