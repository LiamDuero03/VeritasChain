const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const POOL_PATH = path.join(__dirname, "../data/request_pool.json");
const HONEYPOT_PATH = path.join(__dirname, "../data/honeypot.json");

async function main() {
  console.log("🚀 STARTING VERITAS SIMULATION V3: BLIND BATCHING 🚀\n");

  // ====================================================
  // 0. CONFIGURATION
  // ====================================================
  const TOTAL_MINERS = 20;    // Total pool of miners
  const COMMITTEE_SIZE = 10;  // Top N miners to count for final vote
  const HONEYPOT_COUNT = 4;   // How many test images per batch

  // ====================================================
  // 1. INFRASTRUCTURE & MINERS
  // ====================================================
  const signers = await hre.ethers.getSigners();
  const [deployer, aggregator, user, ...others] = signers;
  const minerWallets = others.slice(0, TOTAL_MINERS);

  // Deploy Contracts
  const Token = await hre.ethers.getContractFactory("VeritasToken");
  const token = await Token.deploy(10000000); 
  await token.waitForDeployment();
  
  const Registry = await hre.ethers.getContractFactory("MinerRegistry");
  const registry = await Registry.deploy(token.target, 100); 
  await registry.waitForDeployment();

  const Core = await hre.ethers.getContractFactory("VeritasCore");
  const core = await Core.deploy(token.target, registry.target, aggregator.address, 10);
  await core.waitForDeployment();

  console.log(`✅ Contracts Deployed. Core: ${core.target}`);

  // Register Miners
  console.log(`--- 👷 Registering ${TOTAL_MINERS} Miners ---`);
  for (const m of minerWallets) {
      await token.transfer(m.address, 500);
      await token.connect(m).approve(registry.target, 100);
      await registry.connect(m).registerMiner(100);
  }

  // Load Data
  let requestPool = JSON.parse(fs.readFileSync(POOL_PATH, "utf8"));
  let honeypotData = JSON.parse(fs.readFileSync(HONEYPOT_PATH, "utf8"));
  let pendingRequests = requestPool.filter(r => r.status === "pending");

  if (pendingRequests.length === 0) { console.log("No pending requests."); return; }

  // Fund User
  await token.transfer(user.address, 1000);
  await token.connect(user).approve(core.target, 1000);


  // ====================================================
  // 2. THE PROCESSING LOOP (BLIND BATCHING)
  // ====================================================
  console.log(`\n--- 🎲 PROCESSING ${pendingRequests.length} REQUESTS (BLIND MODE) ---`);

  for (const userReq of pendingRequests) {
      console.log(`\n🔹 Processing Request: ${userReq.hash}`);

      // 1. User Submits on-chain
      const tx = await core.connect(user).submitRequest(userReq.hash);
      const receipt = await tx.wait();
      const log = receipt.logs.find(x => { try { return core.interface.parseLog(x).name === "NewRequest" } catch(e){return false} });
      const chainRequestId = core.interface.parseLog(log).args[0];

      // 2. AGGREGATOR CREATES THE "BLIND BATCH"
      // We pick random honeypots to mix with the user image
      const batchHoneypots = [];
      for(let i=0; i<HONEYPOT_COUNT; i++) {
          batchHoneypots.push(honeypotData[Math.floor(Math.random() * honeypotData.length)]);
      }
      
      console.log(`   📦 Batch Created: 1 User Image + ${HONEYPOT_COUNT} Blind Honeypots`);

      // 3. MINERS PROCESS THE BATCH
      // Each miner returns results for ALL 5 images (4 honeypots + 1 user image)
      // They don't know which is which.
      
      let minerResults = [];

      for (const miner of minerWallets) {
          // Miner Skill Simulation (Randomized)
          // Some miners are smarter (higher base accuracy)
          const minerBaseAccuracy = 0.6 + (Math.random() * 0.35); // 60% - 95% accuracy

          // A. Grade the Honeypots
          let honeypotScore = 0;
          for(const hp of batchHoneypots) {
              const isCorrect = Math.random() < minerBaseAccuracy;
              if(isCorrect) honeypotScore++;
          }
          
          // B. Grade the User Image
          // (In reality, they just submit a vote, we verify it against ground truth later)
          const getsUserImageRight = Math.random() < minerBaseAccuracy;
          const voteOnUserImage = getsUserImageRight ? userReq.trueLabel : !userReq.trueLabel;

          minerResults.push({
              address: miner.address,
              accuracy: honeypotScore / HONEYPOT_COUNT, // e.g., 0.75
              vote: voteOnUserImage,
              rawScore: honeypotScore
          });
      }

      // 4. AGGREGATOR SELECTS THE "COMMITTEE"
      // Sort miners by their Honeypot Accuracy (High -> Low)
      minerResults.sort((a, b) => b.accuracy - a.accuracy);

      // Take top 10
      const committee = minerResults.slice(0, COMMITTEE_SIZE);
      console.log(`   🏆 Top ${COMMITTEE_SIZE} miners selected. Accuracy range: ${(committee[committee.length-1].accuracy*100).toFixed(0)}% - ${(committee[0].accuracy*100).toFixed(0)}%`);


      // 5. CALCULATE WEIGHTED CONSENSUS
      // Formula: Sum(Vote * Accuracy) / Sum(Accuracy)
      // Vote is converted: true(AI)=1, false(Real)=-1 for calculation, or just weighted sums
      
      let aiWeight = 0;
      let realWeight = 0;
      let winningMiners = []; // List of miners to pay (those who made the cut)

      for (const m of committee) {
          winningMiners.push(m.address);
          
          if (m.vote === true) { // Voted AI
              aiWeight += m.accuracy;
          } else { // Voted Real
              realWeight += m.accuracy;
          }
      }

      const totalWeight = aiWeight + realWeight;
      const confidenceScore = Math.floor((aiWeight / totalWeight) * 100);
      const finalVerdictIsAI = aiWeight > realWeight;

      console.log(`   ⚖️  Weighted Votes -> AI: ${aiWeight.toFixed(2)} | Real: ${realWeight.toFixed(2)}`);
      console.log(`   > Verdict: ${finalVerdictIsAI ? "AI 🤖" : "REAL 📸"} (Confidence: ${confidenceScore}%)`);


      // 6. FINALIZE ON CHAIN
      await core.connect(aggregator).finalizeResult(
          chainRequestId,
          finalVerdictIsAI,
          confidenceScore,
          winningMiners
      );
      
      console.log(`   ✅ Finalized on Blockchain.`);

      // Update JSON
      userReq.status = "verified";
      userReq.verdict = finalVerdictIsAI ? "AI" : "REAL";
  }

  // Save State
  fs.writeFileSync(POOL_PATH, JSON.stringify(requestPool, null, 2));
  console.log("\n🏁 SIMULATION COMPLETE");
}

main().catch(console.error);