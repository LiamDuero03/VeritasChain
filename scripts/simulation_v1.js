const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// DATA PATHS
const DATA_DIR = path.join(__dirname, "../data");
const TEST_POOL_PATH = path.join(DATA_DIR, "test_pool.json");
const REQUEST_POOL_PATH = path.join(DATA_DIR, "request_pool.json");

const MOCK_POOL = [
    { hash: "QmDefault1", trueLabel: true, status: "pending" }, 
    { hash: "QmDefault2", trueLabel: false, status: "pending" }
];

async function main() {
  console.log("🚀 STARTING VERITAS PROTOCOL: PROPORTIONAL REWARDS DEMO 🚀\n");

  // ====================================================
  // 1. SETUP
  // ====================================================
  const signers = await hre.ethers.getSigners();
  const [deployer, aggregator, user, ...others] = signers;
  const minerWallets = others.slice(0, 10); 

  console.log(`> Deploying contracts...`);

  const Token = await hre.ethers.getContractFactory("VeritasToken");
  const token = await Token.deploy(1000000); 
  await token.waitForDeployment();

  const Registry = await hre.ethers.getContractFactory("MinerRegistry");
  const registry = await Registry.deploy(token.target, 100); 
  await registry.waitForDeployment();

  const fee = hre.ethers.parseUnits("10", 18); // 10 VRT
  const Core = await hre.ethers.getContractFactory("VeritasCore");
  const core = await Core.deploy(token.target, registry.target, aggregator.address, fee);
  await core.waitForDeployment();

  console.log(`✅ Contracts Deployed. Core: ${core.target}\n`);

  console.log(`--- 👷 Registering ${minerWallets.length} Miners ---`);
  const stakeAmount = hre.ethers.parseUnits("100", 18);
  for (const m of minerWallets) {
      await token.transfer(m.address, stakeAmount * 5n); 
      await token.connect(m).approve(registry.target, stakeAmount);
      await registry.connect(m).registerMiner(stakeAmount);
  }
  console.log("✅ Miners Ready.\n");

  // ====================================================
  // 2. DATA LOADING
  // ====================================================
  if (!fs.existsSync(DATA_DIR)){ fs.mkdirSync(DATA_DIR); }
  let currentRequests = [];

  if (fs.existsSync(TEST_POOL_PATH)) {
      const testData = JSON.parse(fs.readFileSync(TEST_POOL_PATH, "utf8"));
      currentRequests = testData;
      fs.writeFileSync(REQUEST_POOL_PATH, JSON.stringify(currentRequests, null, 2));
      console.log(`📂 Loaded ${currentRequests.length} requests from file.`);
  } else {
      console.log(`⚠️ Using Mock Data.`);
      currentRequests = MOCK_POOL;
  }

  const pendingRequests = currentRequests.filter(r => r.status === "pending");
  if (pendingRequests.length === 0) { console.log("No pending requests."); return; }

  // ====================================================
  // 3. PROCESSING LOOP
  // ====================================================
  console.log(`\n--- 🎲 PROCESSING ${pendingRequests.length} REQUESTS ---`);

  // Fund User
  await token.transfer(user.address, fee * 100n);
  await token.connect(user).approve(core.target, fee * 100n);

  for (const userReq of pendingRequests) {
      console.log(`\n🔹 Processing Image Hash: ${userReq.hash}`);

      // A. SUBMIT
      let chainRequestId;
      try {
          const tx = await core.connect(user).submitRequest(userReq.hash);
          const receipt = await tx.wait();
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
          console.error(`   ❌ Submission Failed: ${error.message}`);
          continue;
      }

      // B. MINER WORK (10 Honeypots for Granularity)
      const HONEYPOT_COUNT = 10; 
      let minerReports = [];
      
      for (const miner of minerWallets) {
          const skill = 0.95 - (minerWallets.indexOf(miner) * 0.05); 
          let honeypotScore = 0;
          for(let i=0; i<HONEYPOT_COUNT; i++) { if(Math.random() < skill) honeypotScore++; }

          const getsUserImageRight = Math.random() < skill;
          const vote = getsUserImageRight ? userReq.trueLabel : !userReq.trueLabel;

          minerReports.push({
              address: miner.address,
              accuracy: honeypotScore / HONEYPOT_COUNT,
              vote: vote
          });
      }

      // C. CONSENSUS & PROPORTIONAL REWARDS
      minerReports.sort((a, b) => b.accuracy - a.accuracy);
      const COMMITTEE_SIZE = 3;
      const committee = minerReports.slice(0, COMMITTEE_SIZE).filter(m => m.accuracy > 0.6);

      console.log(`   [Consensus] Selected Top ${committee.length} miners.`);

      let aiWeight = 0, realWeight = 0;
      const winningAddresses = [];
      const rewardAmounts = []; // Array to store calculated VRT per miner

      // 1. Calculate Total Accuracy of the Committee
      const totalAccuracySum = committee.reduce((sum, m) => sum + m.accuracy, 0);
      const totalRewardPool = 8.0; // 80% of 10 VRT Fee

      for(const m of committee) {
          winningAddresses.push(m.address);
          if(m.vote === true) aiWeight += m.accuracy;
          else realWeight += m.accuracy;

          // 2. Calculate Proportional Share
          // Formula: (My Accuracy / Total Accuracy) * Total Pool
          const myShare = (m.accuracy / totalAccuracySum) * totalRewardPool;
          
          // Convert to Wei for Blockchain (18 decimals)
          const shareInWei = hre.ethers.parseUnits(myShare.toFixed(18), 18);
          rewardAmounts.push(shareInWei);
      }

      // Verdict Logic
      const isAI = aiWeight > realWeight;
      const confidence = (aiWeight + realWeight) > 0 
          ? Math.floor((Math.max(aiWeight, realWeight) / (aiWeight + realWeight)) * 100)
          : 0;

      console.log(`   [Verdict] ${isAI ? "AI GENERATED 🤖" : "REAL IMAGE 📸"} (Confidence: ${confidence}%)`);

      // 3. VISUALIZE PAYOUTS
      if (winningAddresses.length > 0) {
          console.log(`   [Payout] 💰 Proportional Rewards (Based on Accuracy):`);
          winningAddresses.forEach((addr, index) => {
              const amountEth = hre.ethers.formatUnits(rewardAmounts[index], 18);
              const accuracyPct = (committee[index].accuracy * 100).toFixed(0);
              console.log(`      -> Miner ${addr.slice(0,6)}... (${accuracyPct}% Acc) received ${parseFloat(amountEth).toFixed(4)} VRT`);
          });
      }

      // D. FINALIZE ON CHAIN
      userReq.status = "verified";
      userReq.verdict = isAI ? "AI" : "REAL";
      
      try {
          // Note: We now pass the 'rewardAmounts' array!
          const finalizeTx = await core.connect(aggregator).finalizeResult(
              chainRequestId, isAI, confidence, winningAddresses, rewardAmounts
          );
          await finalizeTx.wait();
          console.log(`   [Chain] Finalized.`);
      } catch (err) { console.error(`   ❌ Finalization Failed: ${err.message}`); }

      // Update Reputation
      for(const report of minerReports) {
          const passed = report.accuracy > 0.6;
          await registry.connect(deployer).updateMinerPerformance(report.address, passed);
      }
  }

  if (fs.existsSync(REQUEST_POOL_PATH)) {
      fs.writeFileSync(REQUEST_POOL_PATH, JSON.stringify(currentRequests, null, 2));
      console.log(`\n💾 UPDATED request_pool.json.`);
  }

  console.log("\n🏁 DEMO COMPLETE");
}

main().catch(console.error);