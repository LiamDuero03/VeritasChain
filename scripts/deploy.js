const hre = require("hardhat");

async function main() {
  // 1. Get the contract factory
  const VeritasToken = await hre.ethers.getContractFactory("VeritasToken");

  // 2. Define initial supply (e.g., 1,000,000 tokens)
  const initialSupply = 1000000;

  // 3. Deploy the contract
  const veritas = await VeritasToken.deploy(initialSupply);
  await veritas.waitForDeployment();

  console.log(`Veritas Token deployed to: ${veritas.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// 1. Set Minimum Stake (e.g., 100 VRT)
  // We must handle decimals (18 decimals standard)
  const minStake = hre.ethers.parseUnits("100", 18);

  // 2. Deploy Registry
  const MinerRegistry = await hre.ethers.getContractFactory("MinerRegistry");
  // Pass Token Address and Min Stake to constructor
  const registry = await MinerRegistry.deploy(veritas.target, minStake); 
  await registry.waitForDeployment();

  console.log(`MinerRegistry deployed to: ${registry.target}`);

  // 1. Define Aggregator Address
  // For PoC, we can use the 2nd account in the Hardhat list as the "Aggregator"
  const signers = await hre.ethers.getSigners();
  const aggregatorAddress = signers[1].address; 
  
  console.log(`Aggregator Role assigned to: ${aggregatorAddress}`);

  // 2. Set Fee (e.g., 10 VRT)
  const fee = hre.ethers.parseUnits("10", 18);

  // 3. Deploy VeritasCore
  const VeritasCore = await hre.ethers.getContractFactory("VeritasCore");
  const core = await VeritasCore.deploy(
      veritas.target, 
      registry.target, 
      aggregatorAddress, 
      fee
  );
  await core.waitForDeployment();

  console.log(`VeritasCore deployed to: ${core.target}`);