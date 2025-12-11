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
    // User gets enough for multiple tests
    await veritasToken.transfer(user.address, ethers.parseUnits("1000", 18));
    await veritasToken.transfer(miner1.address, STAKE_AMOUNT);
    await veritasToken.transfer(miner2.address, STAKE_AMOUNT);
    await veritasToken.transfer(miner3.address, STAKE_AMOUNT);

    // 6. Setup: Miners Approve Registry
    await veritasToken.connect(miner1).approve(minerRegistry.target, STAKE_AMOUNT);
    await veritasToken.connect(miner2).approve(minerRegistry.target, STAKE_AMOUNT);
    await veritasToken.connect(miner3).approve(minerRegistry.target, STAKE_AMOUNT);

    // 7. Setup: User Approves Core
    // User approves a large amount so we don't need to re-approve every test
    await veritasToken.connect(user).approve(veritasCore.target, ethers.parseUnits("1000", 18));
  });

  // =========================================================
  // 1. ECONOMIC FLOW TESTS
  // =========================================================
  describe("1. Economic Flow", function () {
    
    it("User_Can_Submit_Request: Should deduct fee and emit event", async function () {
      const userBalanceBefore = await veritasToken.balanceOf(user.address);
      const contractBalanceBefore = await veritasToken.balanceOf(veritasCore.target);

      const tx = await veritasCore.connect(user).submitRequest("QmHash123");
      
      await expect(tx)
        .to.emit(veritasCore, "NewRequest")
        .withArgs(0, "QmHash123", user.address);

      const userBalanceAfter = await veritasToken.balanceOf(user.address);
      expect(userBalanceAfter).to.equal(userBalanceBefore - VERIFICATION_FEE);

      const contractBalanceAfter = await veritasToken.balanceOf(veritasCore.target);
      expect(contractBalanceAfter).to.equal(contractBalanceBefore + VERIFICATION_FEE);
    });

    it("Miner_Registration: Should lock stake and register miner", async function () {
      await minerRegistry.connect(miner1).registerMiner(STAKE_AMOUNT);

      const isEligible = await minerRegistry.isMinerEligible(miner1.address);
      expect(isEligible).to.be.true;

      // Check Tokens locked in Registry Contract
      const registryBalance = await veritasToken.balanceOf(minerRegistry.target);
      expect(registryBalance).to.equal(STAKE_AMOUNT);

      // Check Miner 2 (Not registered yet)
      const isMiner2Eligible = await minerRegistry.isMinerEligible(miner2.address);
      expect(isMiner2Eligible).to.be.false;
    });
  });

  // =========================================================
  // 2. THE HONEYPOT MECHANISM (Logic Tests)
  // =========================================================
  describe("2. Honeypot Mechanism Logic", function () {
    
    beforeEach(async function () {
      await minerRegistry.connect(miner1).registerMiner(STAKE_AMOUNT);
      await minerRegistry.connect(miner2).registerMiner(STAKE_AMOUNT);
      // Miner 3 is NOT registered yet
    });

    it("Aggregator_Filters_Low_Accuracy: Should exclude bad miner from rewards", async function () {
        await veritasCore.connect(user).submitRequest("QmHashTarget");
        
        // Miner 3 registers but we pretend they failed the honeypot
        await minerRegistry.connect(miner3).registerMiner(STAKE_AMOUNT);

        // Action: Aggregator finalizes results
        // We EXCLUDE Miner 3 from the arrays
        const winningMiners = [miner1.address, miner2.address]; 
        
        // Split the 80% Reward (8 VRT) into 4 VRT each
        const rewardAmounts = [ethers.parseUnits("4", 18), ethers.parseUnits("4", 18)];

        await veritasCore.connect(aggregator).finalizeResult(
            0, true, 95, winningMiners, rewardAmounts
        );

        // Expectation: Miner 3 gets NO rewards (Balance remains 0 after staking)
        const miner3Balance = await veritasToken.balanceOf(miner3.address);
        expect(miner3Balance).to.equal(0); 

        // Miner 1 should have reward
        const miner1Balance = await veritasToken.balanceOf(miner1.address);
        expect(miner1Balance).to.equal(ethers.parseUnits("4", 18)); 
    });

    it("Weighted_Average_Calculation: Stores final confidence score", async function () {
        await veritasCore.connect(user).submitRequest("QmHashMixedVote");

        // Aggregator calculates 75% confidence off-chain and sends it
        await veritasCore.connect(aggregator).finalizeResult(
            0, 
            true, // Is AI
            75,   // Confidence Score
            [miner1.address],
            [ethers.parseUnits("8", 18)] // Dummy reward
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

    it("Rewards_Distribution: Should respect Proportional Split", async function () {
        // Fee is 10 VRT. Protocol Revenue is 20% (2 VRT).
        // Miner Pool is 80% (8 VRT).
        await veritasCore.connect(user).submitRequest("QmHashMoney");
        
        // We reward Miner 1 with the full 8 VRT
        const rewards = [ethers.parseUnits("8", 18)];

        await veritasCore.connect(aggregator).finalizeResult(
            0, true, 90, [miner1.address], rewards
        );

        // Check Miner Reward
        const minerBalance = await veritasToken.balanceOf(miner1.address);
        expect(minerBalance).to.equal(ethers.parseUnits("8", 18));

        // Check Protocol Revenue (Remaining in Core contract)
        const coreBalance = await veritasToken.balanceOf(veritasCore.target);
        expect(coreBalance).to.equal(ethers.parseUnits("2", 18));
    });

    it("Slashing_Logic: Should burn tokens and deregister if stake is too low", async function () {
        // Slash 150 VRT from 200 VRT stake. Remaining = 50.
        const slashAmount = ethers.parseUnits("150", 18);
        
        await minerRegistry.connect(owner).slashMiner(miner1.address, slashAmount, "Bad performance");

        // Expectation: Miner is no longer eligible (50 < 100 Min Stake)
        const isEligible = await minerRegistry.isMinerEligible(miner1.address);
        expect(isEligible).to.be.false;

        // Expectation: Tokens were burnt from Total Supply
        const totalSupply = await veritasToken.totalSupply();
        expect(totalSupply).to.equal(INITIAL_SUPPLY - slashAmount);
    });

    it("Tamper_Proof_Verification: Non-aggregator cannot finalize", async function () {
        await veritasCore.connect(user).submitRequest("QmHashHack");

        // Action: User tries to finalize (hack)
        await expect(
            veritasCore.connect(user).finalizeResult(
                0, true, 100, [miner1.address], [ethers.parseUnits("8", 18)]
            )
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
        await minerRegistry.connect(miner3).registerMiner(STAKE_AMOUNT); 

        // 2. User submits 'suspected_scam.jpg'
        await veritasCore.connect(user).submitRequest("QmSuspectedScamJPG");
        
        // 3. Aggregator Off-Chain Logic Simulation:
        //    - Miner 1 & 2 passed. Miner 3 failed.
        //    - Total Payout Pool = 8 VRT.
        //    - Even split = 4 VRT each.
        const winningMiners = [miner1.address, miner2.address];
        const rewards = [ethers.parseUnits("4", 18), ethers.parseUnits("4", 18)];
        
        const finalConfidence = 98; // High confidence it's AI
        const isAI = true;

        // 4. Aggregator finalizes on-chain
        await veritasCore.connect(aggregator).finalizeResult(
            0, isAI, finalConfidence, winningMiners, rewards
        );

        // 5. Verification Checks
        const request = await veritasCore.requests(0);
        expect(request.isAI).to.be.true;
        expect(request.isFinalized).to.be.true;

        // Check Payouts
        const m1Bal = await veritasToken.balanceOf(miner1.address);
        const m2Bal = await veritasToken.balanceOf(miner2.address);
        const m3Bal = await veritasToken.balanceOf(miner3.address);

        expect(m1Bal).to.equal(ethers.parseUnits("4", 18));
        expect(m2Bal).to.equal(ethers.parseUnits("4", 18));
        expect(m3Bal).to.equal(0); // Miner 3 gets nothing

        // Check Protocol Revenue
        const protocolRevenue = await veritasToken.balanceOf(veritasCore.target);
        expect(protocolRevenue).to.equal(ethers.parseUnits("2", 18));
    });
  });

});