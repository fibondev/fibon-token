# Fibon Token

# Deploying Fibon Token System via Remix

## Prerequisites

- Access to [Remix IDE](https://remix.ethereum.org/)
- MetaMask or similar web3 wallet
- Sufficient ETH for gas fees

## Deployment Steps

### 1. Deploy FibonMultiSig

1. Load `FibonMultiSig.sol` into Remix
2. Compile the contract
3. Navigate to the "Deploy & Run Transactions" tab
4. Set the environment to "Injected Web3"
5. Deploy with parameters:
   - `_owners`: Array of owner addresses
   - `_required`: Number of required confirmations

### 2. Deploy FibonToken Implementation

1. Load `FibonToken.sol` into Remix
2. Compile the contract
3. Deploy the contract (no constructor parameters needed)

### 3. Deploy FibonProxy

1. Load `FibonProxy.sol` into Remix
2. Compile the contract
3. In the "Deploy" section, provide:
   - `_logic`: Address of FibonToken implementation
   - `_data`: ABI-encoded `initialize` function call with multisig address
