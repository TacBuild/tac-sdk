#!/bin/bash
set -e
rm -rf dist

# Helper to run hardhat build (ignores libuv crash at exit)
run_hardhat_build() {
    local dir=$1
    echo "  Building in $dir..."
    (cd "$dir" && npm i && npx hardhat compile) || true  # Ignore exit code
    # Check if compilation actually worked by checking output exists
    if [ ! -d "$dir/artifacts" ]; then
        echo "ERROR: Hardhat compilation failed in $dir"
        exit 1
    fi
    (cd "$dir" && rsync -avh --delete ./artifacts ./scripts ./typechain-types ../tac/internal/) || exit 1
}

# Helper to run TON build
run_ton_build() {
    local dir=$1
    echo "  Building in $dir..."
    (cd "$dir" && npm i && npm run compile:ts && npm run build:all && rsync -avh --delete ./build ./wrappers ../ton/internal/) || exit 1
}

echo "Building TON artifacts..."
run_ton_build "artifacts/dev/l1_tvm_ton"
run_ton_build "artifacts/testnet/l1_tvm_ton"
run_ton_build "artifacts/mainnet/l1_tvm_ton"

echo "Building TAC artifacts..."
run_hardhat_build "artifacts/dev/l2-evm"
run_hardhat_build "artifacts/testnet/l2-evm"
run_hardhat_build "artifacts/mainnet/l2-evm"

echo "Compiling TypeScript..."
tsc --declaration

echo "Build complete!"
