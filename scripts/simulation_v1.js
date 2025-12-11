const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// DATA PATHS
const DATA_DIR = path.join(__dirname, "../data");
const TEST_POOL_PATH = path.join(DATA_DIR, "test_pool.json");
const REQUEST_POOL_PATH = path.join(DATA_DIR, "request_pool.json");

// Default Mock Data (Fallback)
const MOCK_POOL = [
    { hash: "QmDefault1", trueLabel: true, status: "pending" }, 
    { hash: "QmDefault2", trueLabel: false, status: "pending" }
];

async function main() {
  console.log("🚀 STARTING VERITAS PROTOCOL: END-TO-END DEMO 🚀\n");

  // ====================================================
  // 1. SETUP & DEPLOYMENT
  // ====================================================
  const signers = await hre.ethers.getSigners();
  const [deployer, aggregator, user, ...others] = signers;
  const minerWallets = others.slice(0, 5); 

  console.log(`> Deploying contracts...`);

  // Deploy Token
  const Token = await hre.ethers.getContractFactory("VeritasToken");
  const token = await Token.deploy(1000000); 
  await token.waitForDeployment();

  // Deploy Registry
  const Registry = await hre.ethers.getContractFactory("MinerRegistry");
  const registry = await Registry.deploy(token.target, 100); 
  await registry.waitForDeployment();

  // Deploy Core
  const Core = await hre.ethers.getContractFactory("VeritasCore");
  const fee = hre.ethers.parseUnits("10", 18);
  const core = await Core.deploy(token.target, registry.target, aggregator.address, fee);
  await core.waitForDeployment();

  console.log(`✅ Contracts Deployed. Core: ${core.target}\n`);

  // Register Miners
  console.log(`--- 👷 Registering ${minerWallets.length} Miners ---`);
  const stakeAmount = hre.ethers.parseUnits("100", 18);
  for (const m of minerWallets) {
      await token.transfer(m.address, stakeAmount * 5n); 
      await token.connect(m).approve(registry.target, stakeAmount);
      await registry.connect(m).registerMiner(stakeAmount);
  }
  console.log("✅ Miners Ready.\n");

  // ====================================================
  // 2. DATA SEEDING (TEST_POOL -> REQUEST_POOL)
  // ====================================================
  
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)){ fs.mkdirSync(DATA_DIR); }

  let currentRequests = [];

  // STEP A: Read from test_pool.json if it exists
  if (fs.existsSync(TEST_POOL_PATH)) {
      console.log(`📂 Reading requests from test_pool.json...`);
      const testData = JSON.parse(fs.readFileSync(TEST_POOL_PATH, "utf8"));
      currentRequests = testData;
      
      // STEP B: Write to request_pool.json (Simulating DB update)
      fs.writeFileSync(REQUEST_POOL_PATH, JSON.stringify(currentRequests, null, 2));
      console.log(`💾 Seeded request_pool.json with ${currentRequests.length} images.`);
  } else {
      console.log(`⚠️ test_pool.json not found. Using Mock Data.`);
      currentRequests = MOCK_POOL;
  }

  // Filter for pending
  const pendingRequests = currentRequests.filter(r => r.status === "pending");
  if (pendingRequests.length === 0) { console.log("No pending requests."); return; }

  // ====================================================
  // 3. THE CORE LOOP
  // ====================================================
  console.log(`\n--- 🎲 PROCESSING ${pendingRequests.length} REQUESTS ---`);

  // Fund User High Enough to avoid crash
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

      // B. MINER WORK (Simulated)
      const batchSize = 3; 
      let minerReports = [];
      
      for (const miner of minerWallets) {
          const skill = 0.95 - (minerWallets.indexOf(miner) * 0.15); 
          
          let honeypotScore = 0;
          for(let i=0; i<batchSize; i++) { if(Math.random() < skill) honeypotScore++; }

          const getsUserImageRight = Math.random() < skill;
          const vote = getsUserImageRight ? userReq.trueLabel : !userReq.trueLabel;

          minerReports.push({
              address: miner.address,
              accuracy: honeypotScore / batchSize,
              vote: vote
          });
      }

      // C. CONSENSUS
      const passingMiners = minerReports.filter(m => m.accuracy > 0.6);
      let aiWeight = 0, realWeight = 0;
      const winningAddresses = [];

      for(const m of passingMiners) {
          winningAddresses.push(m.address);
          if(m.vote === true) aiWeight += m.accuracy;
          else realWeight += m.accuracy;
      }

      const isAI = aiWeight > realWeight;
      const confidence = (aiWeight + realWeight) > 0 
          ? Math.floor((Math.max(aiWeight, realWeight) / (aiWeight + realWeight)) * 100)
          : 0;

      const verdictString = isAI ? "AI" : "REAL";
      console.log(`   [Verdict] ${verdictString} (Confidence: ${confidence}%)`);

      // D. UPDATE JSON OBJECT (In Memory)
      userReq.status = "verified";
      userReq.verdict = verdictString;
      userReq.confidence = confidence;

      // E. FINALIZE ON CHAIN
      try {
          const finalizeTx = await core.connect(aggregator).finalizeResult(
              chainRequestId, isAI, confidence, winningAddresses
          );
          await finalizeTx.wait();
          console.log(`   [Chain] Finalized.`);
      } catch (err) { console.error(`   ❌ Finalization Failed: ${err.message}`); }

      // F. UPDATE REPUTATION
      for(const report of minerReports) {
          const passed = report.accuracy > 0.6;
          await registry.connect(deployer).updateMinerPerformance(report.address, passed);
      }
  }

  // ====================================================
  // 4. SAVE RESULTS TO FILE
  // ====================================================
  // This is the step that makes your project look like a real app!
  // It writes the 'verified' status back to the file.
  if (fs.existsSync(REQUEST_POOL_PATH)) {
      fs.writeFileSync(REQUEST_POOL_PATH, JSON.stringify(currentRequests, null, 2));
      console.log(`\n💾 UPDATED request_pool.json with final verdicts.`);
  }

  console.log("\n🏁 DEMO COMPLETE");
}

main().catch(console.error);