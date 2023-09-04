use aiken/builtin
use aiken/dict
use aiken/hash
use aiken/list
use aiken/transaction.{
  InlineDatum, Input, Output, OutputReference, ScriptContext, Transaction,
} as tx
use aiken/transaction/credential.{ScriptCredential}
use aiken/transaction/value.{AssetName, PolicyId, Value}

pub fn find_input_resolved(
  inputs: List<Input>,
  output_ref: OutputReference,
) -> Output {
  expect [input, ..inputs] = inputs

  if input.output_reference == output_ref {
    input.output
  } else {
    find_input_resolved(inputs, output_ref)
  }
}

pub fn list_at(l: List<a>, index: Int) -> a {
  expect [head, ..rest] = l

  if index == 0 {
    head
  } else {
    list_at(rest, index - 1)
  }
}

pub fn quantity_of(
  val: Value,
  policy_id: PolicyId,
  asset_name: AssetName,
) -> Int {
  when val |> value.to_dict |> dict.get(policy_id) is {
    Some(asset) ->
      when dict.get(asset, asset_name) is {
        Some(quantity) -> quantity
        None -> 0
      }
    None -> 0
  }
}

pub fn value_has_nft_and_lovelace(
  val: Value,
  policy: PolicyId,
  asset_name: AssetName,
) -> Bool {
  expect [(policy1, amount1), (policy2, amount2)] =
    val
      |> value.to_dict
      |> dict.to_list()

  if policy1 == value.ada_policy_id {
    // Should always reach here since maps come in ordered on chain
    expect [(token_name, quantity)] = amount2 |> dict.to_list()

    and {
      policy2 == policy,
      quantity == 1,
      token_name == asset_name,
    }
  } else {
    expect [(token_name, quantity)] = amount1 |> dict.to_list()

    and {
      policy1 == policy,
      quantity == 1,
      token_name == asset_name,
    }
  }
}
