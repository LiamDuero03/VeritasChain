const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Veritas Protocol MVP Tests", function () {
  let VeritasToken, veritasToken;
  let MinerRegistry, minerRegistry;
  let VeritasCore, veritasCore;
  let owner, aggregator, miner1, miner2, miner3, user;

  // Constants
  const INITIAL_SUPPLY = ethers.parseUnits("1000000", 18);
  const MIN_STAKE = ethers.parseUnits("100", 18);
  const VERIFICATION_FEE = ethers.parseUnits("10", 18);
  const STAKE_AMOUNT = ethers.parseUnits("200", 18);

  beforeEach(async function () {
    // 1. Get Signers
    [owner, aggregator, miner1, miner2, miner3, user] = await ethers.getSigners();

    // 2. Deploy Token
    VeritasToken = await ethers.getContractFactory("VeritasToken");
    veritasToken = await VeritasToken.deploy(1000000); // 1M Supply
    await veritasToken.waitForDeployment();

    // 3. Deploy Registry
    MinerRegistry = await ethers.getContractFactory("MinerRegistry");
    minerRegistry = await MinerRegistry.deploy(veritasToken.target, MIN_STAKE);
    await minerRegistry.waitForDeployment();

    // 4. Deploy Core
    VeritasCore = await ethers.getContractFactory("VeritasCore");
    veritasCore = await VeritasCore.deploy(
      veritasToken.target,
      minerRegistry.target,
      aggregator.address,
      VERIFICATION_FEE
    );
    await veritasCore.waitForDeployment();

    // 5. Setup: Fund User and Miners
    await veritasToken.transfer(user.address, ethers.parseUnits("1000", 18));
    await veritasToken.transfer(miner1.address, STAKE_AMOUNT);
    await veritasToken.transfer(miner2.address, STAKE_AMOUNT);
    await veritasToken.transfer(miner3.address, STAKE_AMOUNT);

    // 6. Setup: Miners Approve Registry
    await veritasToken.connect(miner1).approve(minerRegistry.target, STAKE_AMOUNT);
    await veritasToken.connect(miner2).approve(minerRegistry.target, STAKE_AMOUNT);
    await veritasToken.connect(miner3).approve(minerRegistry.target, STAKE_AMOUNT);

    // 7. Setup: User Approves Core
    await veritasToken.connect(user).approve(veritasCore.target, VERIFICATION_FEE);
  });

  // =========================================================
  // 1. ECONOMIC FLOW TESTS (The Basics)
  // =========================================================
  describe("1. Economic Flow", function () {
    
    it("User_Can_Submit_Request: Should deduct fee and emit event", async function () {
      // Check Balance Before
      const userBalanceBefore = await veritasToken.balanceOf(user.address);
      const contractBalanceBefore = await veritasToken.balanceOf(veritasCore.target);

      // Action: Submit Request
      const tx = await veritasCore.connect(user).submitRequest("QmHash123");
      
      // Check: Event Emitted
      await expect(tx)
        .to.emit(veritasCore, "NewRequest")
        .withArgs(0, "QmHash123", user.address);

      // Check: User Balance Decreased
      const userBalanceAfter = await veritasToken.balanceOf(user.address);
      expect(userBalanceAfter).to.equal(userBalanceBefore - VERIFICATION_FEE);

      // Check: Contract Balance Increased
      const contractBalanceAfter = await veritasToken.balanceOf(veritasCore.target);
      expect(contractBalanceAfter).to.equal(contractBalanceBefore + VERIFICATION_FEE);
    });

    it("Miner_Registration: Should lock stake and register miner", async function () {
      // Action: Miner 1 registers
      await minerRegistry.connect(miner1).registerMiner(STAKE_AMOUNT);

      // Check: Miner is eligible
      const isEligible = await minerRegistry.isMinerEligible(miner1.address);
      expect(isEligible).to.be.true;

      // Check: Tokens locked in Registry Contract
      const registryBalance = await veritasToken.balanceOf(minerRegistry.target);
      expect(registryBalance).to.equal(STAKE_AMOUNT);

      // Check: Miner cannot participate without staking (Miner 2 hasn't registered yet)
      const isMiner2Eligible = await minerRegistry.isMinerEligible(miner2.address);
      expect(isMiner2Eligible).to.be.false;
    });
  });

  // =========================================================
  // 2. THE HONEYPOT MECHANISM (Simulating Logic)
  // =========================================================
  describe("2. Honeypot Mechanism Logic (Simulation)", function () {
    
    beforeEach(async function () {
      // Register miners for these tests
      await minerRegistry.connect(miner1).registerMiner(STAKE_AMOUNT);
      await minerRegistry.connect(miner2).registerMiner(STAKE_AMOUNT);
      // Miner 3 is NOT registered yet for specific tests
    });

    it("Aggregator_Filters_Low_Accuracy: Should exclude bad miner from rewards", async function () {
        // Setup: User submits request
        await veritasCore.connect(user).submitRequest("QmHashTarget");
        
        // Setup: Miner 3 registers (but we will pretend they failed the honeypot)
        await minerRegistry.connect(miner3).registerMiner(STAKE_AMOUNT);

        // Action: Aggregator finalizes results
        // NOTICE: We explicitly exclude Miner 3 from the "winningMiners" array
        // This simulates the off-chain logic filtering them out.
        const winningMiners = [miner1.address, miner2.address]; 
        
        await veritasCore.connect(aggregator).finalizeResult(0, true, 95, winningMiners);

        // Expectation: Miner 3 gets NO rewards
        // Fee = 10. 80% = 8. Split 2 ways = 4 each.
        // Miner 3 should still only have their initial stake left (minus gas if they did txs, but here we check tokens)
        // Since Miner 3 sent stake to registry, their wallet is 0.
        // If they got reward, it would be 4.
        const miner3Balance = await veritasToken.balanceOf(miner3.address);
        expect(miner3Balance).to.equal(0); 

        // Miner 1 should have reward
        const miner1Balance = await veritasToken.balanceOf(miner1.address);
        const expectedReward = ethers.parseUnits("4", 18);
        expect(miner1Balance).to.equal(expectedReward); 
    });

    it("Weighted_Average_Calculation: Stores final confidence score", async function () {
        // Since the weighted math happens off-chain, we test that the contract
        // correctly stores the result provided by the Aggregator.
        
        await veritasCore.connect(user).submitRequest("QmHashMixedVote");

        // Aggregator calculates 75% confidence off-chain and sends it
        await veritasCore.connect(aggregator).finalizeResult(
            0, 
            true, // Is AI
            75,   // Confidence Score
            [miner1.address]
        );

        const request = await veritasCore.requests(0);
        expect(request.isAI).to.be.true;
        expect(request.aiConfidence).to.equal(75);
        expect(request.isFinalized).to.be.true;
    });
  });

  // =========================================================
  // 3. INCENTIVE & SECURITY TESTS
  // =========================================================
  describe("3. Incentive & Security", function () {
    beforeEach(async function () {
        await minerRegistry.connect(miner1).registerMiner(STAKE_AMOUNT);
    });

    it("Rewards_Distribution: Should calculate 80/20 split correctly", async function () {
        // Fee is 10 VRT.
        // Miners share 80% (8 VRT).
        // Protocol keeps 20% (2 VRT).
        
        await veritasCore.connect(user).submitRequest("QmHashMoney");
        
        // Only Miner 1 wins
        await veritasCore.connect(aggregator).finalizeResult(0, true, 90, [miner1.address]);

        // Check Miner Reward
        const minerBalance = await veritasToken.balanceOf(miner1.address);
        expect(minerBalance).to.equal(ethers.parseUnits("8", 18));

        // Check Protocol Revenue (Remaining in Core contract)
        // Core received 10, paid out 8. Should have 2 left.
        const coreBalance = await veritasToken.balanceOf(veritasCore.target);
        expect(coreBalance).to.equal(ethers.parseUnits("2", 18));
    });

    it("Slashing_Logic: Should burn tokens and deregister if stake is too low", async function () {
        // Miner 1 has 200 Staked. Min stake is 100.
        // We slash 150. Remaining = 50. 
        // 50 < 100, so they should be deregistered.
        
        const slashAmount = ethers.parseUnits("150", 18);
        
        // Action: Slash
        await minerRegistry.connect(owner).slashMiner(miner1.address, slashAmount, "Failed Honeypots repeatedly");

        // Expectation: Miner is no longer eligible
        const isEligible = await minerRegistry.isMinerEligible(miner1.address);
        expect(isEligible).to.be.false;

        // Expectation: Tokens were burnt (Total supply reduced)
        // Initial 1M. Minted more? No. 
        // Supply should be Initial - SlashAmount
        const totalSupply = await veritasToken.totalSupply();
        expect(totalSupply).to.equal(INITIAL_SUPPLY - slashAmount);
    });

    it("Tamper_Proof_Verification: Non-aggregator cannot finalize", async function () {
        await veritasCore.connect(user).submitRequest("QmHashHack");

        // Action: User tries to finalize (hack)
        await expect(
            veritasCore.connect(user).finalizeResult(0, true, 100, [miner1.address])
        ).to.be.revertedWith("Only aggregator can finalize");
    });
  });

  // =========================================================
  // 4. SYSTEM INTEGRATION TEST (End-to-End)
  // =========================================================
  describe("4. End-to-End Integration", function () {
    it("Scenario: Suspected Scam Image Verification", async function () {
        // 1. Setup: Register 3 miners
        await minerRegistry.connect(miner1).registerMiner(STAKE_AMOUNT);
        await minerRegistry.connect(miner2).registerMiner(STAKE_AMOUNT);
        await minerRegistry.connect(miner3).registerMiner(STAKE_AMOUNT); // Miner 3 is the "bad" one

        // 2. User submits 'suspected_scam.jpg'
        await veritasCore.connect(user).submitRequest("QmSuspectedScamJPG");
        
        // 3. Aggregator simulates off-chain logic:
        //    - Miner 1: Correct on Honeypots. Says AI.
        //    - Miner 2: Correct on Honeypots. Says AI.
        //    - Miner 3: Failed Honeypots. (Excluded).
        const winningMiners = [miner1.address, miner2.address];
        const finalConfidence = 98; // High confidence it's AI
        const isAI = true;

        // 4. Aggregator finalizes on-chain
        await veritasCore.connect(aggregator).finalizeResult(0, isAI, finalConfidence, winningMiners);

        // 5. Verification Checks
        
        // Check Request Status
        const request = await veritasCore.requests(0);
        expect(request.isAI).to.be.true;
        expect(request.isFinalized).to.be.true;

        // Check Payouts (Miner 1 & 2 get paid, Miner 3 does not)
        // Pool = 8 VRT. Split by 2 = 4 VRT each.
        const m1Bal = await veritasToken.balanceOf(miner1.address);
        const m2Bal = await veritasToken.balanceOf(miner2.address);
        const m3Bal = await veritasToken.balanceOf(miner3.address);

        expect(m1Bal).to.equal(ethers.parseUnits("4", 18));
        expect(m2Bal).to.equal(ethers.parseUnits("4", 18));
        expect(m3Bal).to.equal(0); // Miner 3 still has 0 (stake is locked)

        // Check Protocol Revenue
        const protocolRevenue = await veritasToken.balanceOf(veritasCore.target);
        expect(protocolRevenue).to.equal(ethers.parseUnits("2", 18));
    });
  });

});