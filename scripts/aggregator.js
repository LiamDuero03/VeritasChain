const hre = require("hardhat");

// !!! UPDATE THESE AFTER DEPLOYMENT !!!
const CORE_ADDR = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
const REGISTRY_ADDR = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

async function main() {
  console.log("--- AGGREGATOR NODE STARTED ---");
  
  const coreContract = await hre.ethers.getContractAt("VeritasCore", CORE_ADDR);
  const registryContract = await hre.ethers.getContractAt("MinerRegistry", REGISTRY_ADDR);
  
  const [deployer, aggregatorWallet, ...others] = await hre.ethers.getSigners();
  const potentialMiners = [others[0], others[1], others[2]]; // Must match miner_bot

  coreContract.on("NewRequest", async (requestId, imageHash) => {
    console.log(`\n[EVENT] New Request #${requestId} for image: ${imageHash}`);

    try {
      // 1. Check which miners are actually registered
      const validMiners = [];
      for (const m of potentialMiners) {
          if (await registryContract.isMinerEligible(m.address)) {
              validMiners.push(m);
          }
      }

      if (validMiners.length === 0) {
          console.log("No registered miners found! Run miner_bot.js first.");
          return;
      }

      console.log(`> Dispatching to ${validMiners.length} active miners...`);

      // 2. Simulate Consensus
      const winningMinersAddresses = [];
      let weightedVote = 0;
      let totalWeight = 0;

      for (const miner of validMiners) {
         // SIMULATION: Miner 3 (others[2]) always fails/lies
         const isMalicious = (miner.address === potentialMiners[2].address);
         const accuracy = isMalicious ? 30 : 95; 
         const voteAI = isMalicious ? 0 : 1; // 1 = AI

         if (accuracy > 70) {
             winningMinersAddresses.push(miner.address);
             if(voteAI == 1) weightedVote += accuracy;
             totalWeight += accuracy;
         }
      }

      const finalScore = totalWeight > 0 ? Math.floor((weightedVote * 100) / totalWeight) : 0;
      const isAI = finalScore > 50;

      console.log(`> Consensus: ${isAI ? "AI" : "REAL"} (Score: ${finalScore})`);

      // 3. Finalize on Chain
      const tx = await coreContract.connect(aggregatorWallet).finalizeResult(
        requestId, isAI, finalScore, winningMinersAddresses
      );
      await tx.wait();
      console.log(`[TX] Result Finalized: ${tx.hash}`);

    } catch (err) {
      console.error(err);
    }
  });

  await new Promise(() => {});
}

main().catch(console.error);