import { Lucid } from "https://deno.land/x/lucid@0.10.1/mod.ts";

async function genesis() {
  const lucid = await Lucid.new();
}

await genesis();
