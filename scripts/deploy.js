const hre = require("hardhat");

async function main() {
  const [deployer, aggregator] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy Token
  const VeritasToken = await hre.ethers.getContractFactory("VeritasToken");
  const veritas = await VeritasToken.deploy(1000000); // 1M Initial Supply
  await veritas.waitForDeployment();
  console.log(`VeritasToken deployed to: ${veritas.target}`);

  // 2. Deploy Registry
  const minStake = hre.ethers.parseUnits("100", 18);
  const MinerRegistry = await hre.ethers.getContractFactory("MinerRegistry");
  const registry = await MinerRegistry.deploy(veritas.target, minStake);
  await registry.waitForDeployment();
  console.log(`MinerRegistry deployed to: ${registry.target}`);

  // 3. Deploy Core
  const fee = hre.ethers.parseUnits("10", 18);
  const VeritasCore = await hre.ethers.getContractFactory("VeritasCore");
  const core = await VeritasCore.deploy(veritas.target, registry.target, aggregator.address, fee);
  await core.waitForDeployment();
  console.log(`VeritasCore    deployed to: ${core.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});