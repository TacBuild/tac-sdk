import { Address, beginCell, fromNano, TonClient } from '@ton/ton';

export const SLIPPAGE_PERCENT_VALUE = 0.5;
export const MIN_INPUT_SWAP_VALUE = 25;
export const TONCENTER_URL_ENDPOINT = '/jsonRPC';

export const getUserJettonWalletAddress = async (userAddress: string, tokenAddress: string) => {
  const client = new TonClient({
    endpoint: TONCENTER_URL_ENDPOINT
  });

  const address = Address.parse(userAddress);
  const cell = beginCell().storeAddress(address).endCell();
  const result = await client.runMethod(Address.parse(tokenAddress), 'get_wallet_address', [{
    type: 'slice',
    cell
  }]);

  return result.stack.readAddress().toString();
};

export const getJettonBalance = async (address: string, tokenAddress: string) => {
  const jettonAddress = await getUserJettonWalletAddress(address, tokenAddress);
  const client = new TonClient({
    endpoint: '/jsonRPC'
  });

  const result = await client.runMethod(Address.parse(jettonAddress), 'get_wallet_data');
  return Number(fromNano(result.stack.readNumber()));
};
