require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24", // Updated from 0.8.20 to 0.8.24
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // We are using the default Hardhat network for testing
    // which runs a local chain when you execute 'npx hardhat test'
    hardhat: {
      chainId: 31337,
    },
  },
  // Use the default accounts provided by hardhat for local testing
  defaultNetwork: "hardhat",
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
};