const hre = require("hardhat");

// !!! UPDATE THESE AFTER DEPLOYMENT !!!
const TOKEN_ADDR = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 
const REGISTRY_ADDR = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const CORE_ADDR = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

async function main() {
    // We skip the first 2 accounts (Deployer and Aggregator)
    // We use Account 2, 3, 4 as Miners
    const signers = await hre.ethers.getSigners();
    const miners = [signers[2], signers[3], signers[4]];
    
    const token = await hre.ethers.getContractAt("VeritasToken", TOKEN_ADDR);
    const registry = await hre.ethers.getContractAt("MinerRegistry", REGISTRY_ADDR);
    const core = await hre.ethers.getContractAt("VeritasCore", CORE_ADDR);

    const stakeAmount = hre.ethers.parseUnits("200", 18); // 200 VRT Stake

    console.log("--- STARTING MINER BOT SETUP ---");

    // 1. Fund and Register Miners
    for (const miner of miners) {
        // A. The deployer needs to give them tokens first (Simulation only)
        // In real life, miners buy tokens on an exchange.
        const deployer = signers[0];
        await token.connect(deployer).transfer(miner.address, stakeAmount);
        
        // B. Miner approves Registry to take tokens
        await token.connect(miner).approve(REGISTRY_ADDR, stakeAmount);

        // C. Check if already registered
        const isEligible = await registry.isMinerEligible(miner.address);
        
        if (!isEligible) {
            console.log(`Registering Miner: ${miner.address.slice(0,6)}...`);
            await registry.connect(miner).registerMiner(stakeAmount);
        } else {
            console.log(`Miner ${miner.address.slice(0,6)}... is already registered.`);
        }
    }

    console.log("\n--- MINERS READY & LISTENING ---");
    
    // 2. Listen for Events (To show they are "alive")
    core.on("NewRequest", (reqId, hash, requester) => {
        console.log(`[MINER BOT] Detected Request #${reqId}. Image: ${hash}. Waiting for Aggregator bundle...`);
    });

    // Keep script running
    await new Promise(() => {});
}

main().catch(console.error);