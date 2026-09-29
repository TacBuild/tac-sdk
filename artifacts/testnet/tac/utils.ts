import { getBytes, hexlify, Interface, type BytesLike } from 'ethers';

import structsInterfaceArtifact from './internal/artifacts/contracts/core/Structs.sol/IStructsInterface.json';
import type { OutMessageV1Struct } from './structs';

const structsInterface = new Interface(structsInterfaceArtifact.abi);

export function encodeOutMessageV1(outMessage: OutMessageV1Struct): BytesLike {
    const encodedCall = getBytes(structsInterface.encodeFunctionData('__OutMessageV1', [outMessage]));
    return hexlify(encodedCall.slice(4));
}
