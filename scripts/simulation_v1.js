const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Mock data generation if files don't exist (PREVENTS CRASHES DURING DEMO)
const MOCK_POOL = [
    { hash: "QmImage123", trueLabel: true, status: "pending" }, 
    { hash: "QmImage456", trueLabel: false, status: "pending" }
];
const MOCK_HONEYPOT = [
    { id: 1, isAI: true }, { id: 2, isAI: false }, 
    { id: 3, isAI: true }, { id: 4, isAI: false }
];

async function main() {
  console.log("🚀 STARTING VERITAS PROTOCOL: END-TO-END DEMO 🚀\n");

  // ====================================================
  // 1. SETUP & DEPLOYMENT
  // ====================================================
  const signers = await hre.ethers.getSigners();
  const [deployer, aggregator, user, ...others] = signers;
  const minerWallets = others.slice(0, 5); // Use 5 miners for clean demo output

  console.log(`> Deploying with Account: ${deployer.address}`);
  console.log(`> Aggregator Address:     ${aggregator.address}`);

  // Deploy Token
  const Token = await hre.ethers.getContractFactory("VeritasToken");
  const token = await Token.deploy(1000000); // 1M Supply
  await token.waitForDeployment();

  // Deploy Registry
  const Registry = await hre.ethers.getContractFactory("MinerRegistry");
  const registry = await Registry.deploy(token.target, 100); // 100 VRT Min Stake
  await registry.waitForDeployment();

  // Deploy Core
  const Core = await hre.ethers.getContractFactory("VeritasCore");
  const fee = hre.ethers.parseUnits("10", 18);
  const core = await Core.deploy(token.target, registry.target, aggregator.address, fee);
  await core.waitForDeployment();

  console.log(`✅ Contracts Deployed. Core: ${core.target}\n`);

  // ====================================================
  // 2. MINER REGISTRATION
  // ====================================================
  console.log(`--- 👷 Registering ${minerWallets.length} Miners ---`);
  const stakeAmount = hre.ethers.parseUnits("100", 18);

  for (const m of minerWallets) {
      // 1. Give them money
      await token.transfer(m.address, stakeAmount * 5n); 
      // 2. They approve Registry
      await token.connect(m).approve(registry.target, stakeAmount);
      // 3. They register
      await registry.connect(m).registerMiner(stakeAmount);
  }
  console.log("✅ Miners Staked & Registered.\n");

  // ====================================================
  // 3. LOAD DATA (Or use Mock)
  // ====================================================
  // This ensures your assignment demo works even if you forget the JSON files
  let requestPool = MOCK_POOL;
  
  try {
      if(fs.existsSync(path.join(__dirname, "../data/request_pool.json"))) {
          requestPool = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/request_pool.json"), "utf8"));
      }
  } catch(e) { console.log("⚠️  Using Mock Data for Requests"); }

  // Filter for pending work
  const pendingRequests = requestPool.filter(r => r.status === "pending");
  if (pendingRequests.length === 0) { console.log("No pending requests to process."); return; }

  // ====================================================
  // 4. THE CORE LOOP (The Whitepaper Logic)
  // ====================================================
  console.log(`--- 🎲 PROCESSING ${pendingRequests.length} REQUESTS (BLIND BATCHING) ---`);

  // Fund User - INCREASED FUNDING TO PREVENT CRASHES (100x fee)
  await token.transfer(user.address, fee * 100n);
  await token.connect(user).approve(core.target, fee * 100n);

  for (const userReq of pendingRequests) {
      console.log(`\n🔹 Processing Image Hash: ${userReq.hash}`);

      // A. USER SUBMITS (With Error Handling)
      let receipt, chainRequestId;
      try {
          const tx = await core.connect(user).submitRequest(userReq.hash);
          receipt = await tx.wait();
          
          // Parse logs to find Request ID
          for(const log of receipt.logs) {
              try {
                  const parsed = core.interface.parseLog(log);
                  if(parsed.name === "NewRequest") {
                      chainRequestId = parsed.args[0];
                      break;
                  }
              } catch(e) {}
          }
          console.log(`   [Chain] Request ID #${chainRequestId} created.`);
      } catch (error) {
          console.error(`   ❌ Transaction Failed: ${error.message}`);
          continue; // Skip to the next request if this one fails
      }

      // B. OFF-CHAIN: AGGREGATOR BATCHES IMAGES
      const batchSize = 3; 

      // C. OFF-CHAIN: MINERS DO WORK
      let minerReports = [];
      
      for (const miner of minerWallets) {
          // Simulation: Each miner has a different "skill" level
          // Miner 0 is an expert (95%), Miner 4 is lazy (40%)
          const skill = 0.95 - (minerWallets.indexOf(miner) * 0.15); 
          
          let honeypotScore = 0;
          // Simulate grading 3 honeypots
          for(let i=0; i<batchSize; i++) {
              if(Math.random() < skill) honeypotScore++;
          }

          // Simulate grading the User's Image
          const getsUserImageRight = Math.random() < skill;
          const vote = getsUserImageRight ? userReq.trueLabel : !userReq.trueLabel;

          minerReports.push({
              address: miner.address,
              accuracy: honeypotScore / batchSize, // 0.0 to 1.0
              vote: vote,
              wallet: miner
          });
      }

      // D. OFF-CHAIN: AGGREGATOR CONSENSUS
      // Filter out miners who failed the honeypot (Accuracy < 60%)
      const passingMiners = minerReports.filter(m => m.accuracy > 0.6);
      console.log(`   [Consensus] ${passingMiners.length}/${minerWallets.length} miners passed the Honeypot check.`);

      let aiWeight = 0, realWeight = 0;
      const winningAddresses = [];

      for(const m of passingMiners) {
          winningAddresses.push(m.address);
          if(m.vote === true) aiWeight += m.accuracy; // Weighted by their accuracy
          else realWeight += m.accuracy;
      }

      const isAI = aiWeight > realWeight;
      const confidence = (aiWeight + realWeight) > 0 
          ? Math.floor((Math.max(aiWeight, realWeight) / (aiWeight + realWeight)) * 100)
          : 0;

      console.log(`   [Verdict] ${isAI ? "AI GENERATED 🤖" : "REAL IMAGE 📸"} (Confidence: ${confidence}%)`);

      // E. ON-CHAIN: FINALIZE & PAYOUT
      try {
          const finalizeTx = await core.connect(aggregator).finalizeResult(
              chainRequestId,
              isAI,
              confidence,
              winningAddresses
          );
          await finalizeTx.wait();
          console.log(`   [Chain] Result finalized & Rewards distributed.`);
      } catch (err) {
          console.error(`   ❌ Finalization Failed: ${err.message}`);
      }

      // F. ON-CHAIN: UPDATE REPUTATION
      // The Aggregator (or Owner) updates the registry
      for(const report of minerReports) {
          const passed = report.accuracy > 0.6;
          // Note: In this script 'deployer' is owner. In prod, transfer ownership to aggregator.
          await registry.connect(deployer).updateMinerPerformance(report.address, passed);
      }
  }

  // Final Stats Check
  console.log("\n--- 🏆 FINAL MINER STATS ---");
  const stats = await registry.getMinerStats(minerWallets[0].address);
  console.log(`Miner 1 (Expert) - Rep: ${stats[0]}, Wins: ${stats[1]}, Losses: ${stats[2]}`);
  
  console.log("\n🏁 DEMO COMPLETE");
}

main().catch(console.error);