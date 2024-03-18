const API_URL = 'https://cardano-mainnet.blockfrost.io/api/v0/accounts/';

// need to add the projectID to a .env file and change it on headers
const PROJECT_ID = 'mainnetD3wDwS9AS6alqgJ3OFECWlprNZAwhwII';
const tunaUNIT = '279f842c33eed9054b9e3c70cd6a3b32298259c24b78b895cb41d91a54554e41';
export async function fetchWalletData(walletAddr: string) {
  console.log('project id value', import.meta.env.BLOCKFROST_APIKEY);
  const response = await fetch(`${API_URL}${walletAddr}/addresses/assets`, {
    headers: {
      'project_id': `${PROJECT_ID}`
    }
  });

  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  const tunaData = data.find((item: any) => item.unit === tunaUNIT);

  if (!tunaData) {
    return 0;
  }

  const dividedQuantity = Number(tunaData.quantity) / 100000000;
  
  return dividedQuantity;
}