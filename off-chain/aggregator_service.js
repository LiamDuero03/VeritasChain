const hre = require("hardhat");

// ====================================================
// CONFIGURATION (PASTE YOUR DEPLOYED ADDRESSES HERE)
// ====================================================
const CORE_ADDR = "YOUR_VERITAS_CORE_ADDRESS";       // e.g., 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
const REGISTRY_ADDR = "YOUR_MINER_REGISTRY_ADDRESS"; // e.g., 0x5FbDB2315678afecb367f032d93F642f64180aa3

// Simulation Settings
const HONEYPOT_SIZE = 10; // 10 known images per bundle
const ACCURACY_THRESHOLD = 70; // Miners must score > 70% on honeypot to count

async function main() {
  console.log("---------------------------------------------------------");
  console.log("Veritas Aggregator Node Starting...");
  console.log("Listening for verification requests on:", CORE_ADDR);
  console.log("---------------------------------------------------------");

  // 1. Setup Contract Instances
  const Core = await hre.ethers.getContractFactory("VeritasCore");
  const coreContract = Core.attach(CORE_ADDR);

  const Registry = await hre.ethers.getContractFactory("MinerRegistry");
  const registryContract = Registry.attach(REGISTRY_ADDR);

  // 2. Get the Aggregator Signer (Account #1 based on deploy script)
  const signers = await hre.ethers.getSigners();
  const aggregatorWallet = signers[1]; // MUST match the address set in Core deployment

  // 3. Define the Honeypot "Ground Truth" (Simulation)
  // In real life, this is a database lookup.
  // 1 = AI, 0 = Real
  const honeypotAnswers = [1, 0, 1, 1, 0, 0, 1, 0, 0, 1]; 

  // 4. Start Listening for Events
  // Syntax: contract.on(EventName, (args...) => { ... })
  coreContract.on("NewRequest", async (requestId, imageHash, requester, event) => {
    console.log(`\n[NEW REQUEST DETECTED] ID: ${requestId} | Hash: ${imageHash}`);

    try {
      // Step A: Fetch Available Miners
      // For PoC, we pretend the other signers in Hardhat are the miners
      // We assume they have already registered (we will do this in the test script)
      const potentialMiners = [signers[2], signers[3], signers[4]]; 
      const participatingMiners = [];
      
      let weightedVoteSum = 0;
      let totalWeight = 0;

      console.log(`> Dispatching image bundle to ${potentialMiners.length} miners...`);

      // Step B: Simulate Miner Work
      for (const miner of potentialMiners) {
        
        // --- SIMULATION START ---
        // We simulate that:
        // Miner 1 (signers[2]) is EXCELLENT (100% accuracy)
        // Miner 2 (signers[3]) is GOOD (80% accuracy)
        // Miner 3 (signers[4]) is BAD/MALICIOUS (30% accuracy)
        
        let accuracyScore = 0;
        let minerVerdict = 0; // 1 for AI, 0 for Real

        if (miner === signers[2]) { 
            accuracyScore = 100; // Passed 10/10 honeypots
            minerVerdict = 1;    // Correctly identifies target as AI
        } else if (miner === signers[3]) {
            accuracyScore = 80;  // Passed 8/10 honeypots
            minerVerdict = 1;    // Correctly identifies target as AI
        } else {
            accuracyScore = 30;  // Failed honeypots
            minerVerdict = 0;    // Incorrectly says Real
        }
        // --- SIMULATION END ---

        console.log(`  - Miner ${miner.address.slice(0,6)}... reports. Honeypot Acc: ${accuracyScore}% | Verdict: ${minerVerdict === 1 ? "AI" : "Real"}`);

        // Step C: Filter & Aggregate
        if (accuracyScore >= ACCURACY_THRESHOLD) {
            participatingMiners.push(miner.address);
            
            // Add to weighted average
            // If Verdict is 1 (AI), we add the weight. If 0, we add 0.
            if (minerVerdict === 1) {
                weightedVoteSum += accuracyScore;
            }
            totalWeight += accuracyScore;
        } else {
            console.log(`    -> REJECTED: Accuracy below threshold.`);
        }
      }

      // Step D: Calculate Final Consensus
      if (totalWeight === 0) {
        console.log("  -> No valid miners found. Aborting.");
        return;
      }

      const finalScore = Math.floor((weightedVoteSum * 100) / totalWeight); // Scale to 0-100
      const isAI = finalScore > 50; 

      console.log(`> Consensus Reached: ${isAI ? "AI GENERATED" : "REAL"} (Confidence Score: ${finalScore})`);
      console.log(`> Submitting result to blockchain...`);

      // Step E: Send Transaction
      // Note: We connect the aggregatorWallet so the msg.sender is correct
      const tx = await coreContract.connect(aggregatorWallet).finalizeResult(
        requestId,
        isAI,
        finalScore,
        participatingMiners
      );

      await tx.wait();
      console.log(`[SUCCESS] Request ${requestId} finalized on-chain! Tx: ${tx.hash}`);

    } catch (err) {
      console.error("[ERROR] Processing request:", err);
    }
  });

  // Keep script alive
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});