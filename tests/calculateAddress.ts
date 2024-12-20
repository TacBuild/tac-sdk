import { address } from "@ton/core";

import { TacSdk } from "../src";
import { Network, TacSDKTonClientParams } from "../src";

async function main() {
  const tonClientParams: TacSDKTonClientParams = {
    network: Network.Testnet,
    delay: 1,
  };
  const tacSdk = new TacSdk(tonClientParams);
  await tacSdk.init();

  const tvmTokenAddress = "EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK";

  // Calculate EVM Token based on TVM Token
  const evmTokenAddress = await tacSdk.getEVMTokenAddress(
    tvmTokenAddress
  );

  console.log(evmTokenAddress);

  // Calculate TVM Token based on EVM Token
  const tvmTokenAddressCalculated = await tacSdk.getTVMTokenAddress(
    evmTokenAddress
  );

  console.log(tvmTokenAddressCalculated);

  // Making sure that initial and final addresses are equal
  console.log(`Addresses equal: ${address(tvmTokenAddress).equals(address(tvmTokenAddressCalculated))}`);
}

main();
