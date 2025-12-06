const hre = require("hardhat");

// !!! UPDATE THESE AFTER DEPLOYMENT !!!
const CORE_ADDR = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"; 
const TOKEN_ADDR = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
    const [deployer, aggregator, m1, m2, m3, user] = await hre.ethers.getSigners();
    
    const core = await hre.ethers.getContractAt("VeritasCore", CORE_ADDR);
    const token = await hre.ethers.getContractAt("VeritasToken", TOKEN_ADDR);

    // 1. Give user tokens for fee (Simulation)
    const fee = hre.ethers.parseUnits("10", 18);
    await token.connect(deployer).transfer(user.address, fee);
    
    // 2. Approve Core
    await token.connect(user).approve(CORE_ADDR, fee);

    // 3. Submit
    console.log(`User ${user.address.slice(0,6)} submitting image...`);
    const tx = await core.connect(user).submitRequest("QmHasH_OF_IMAGE_ABC123");
    await tx.wait();
    console.log("Request Submitted!");
}
main().catch(console.error);