const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ValidatorRegistry", function () {
    let VERIToken;
    let ValidatorRegistry;
    let veriToken;
    let validatorRegistry;
    let owner;
    let validator1;
    let validator2;
    let requester;

    const INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10 million VERI
    const MIN_STAKE = ethers.parseEther("100000"); // 100,000 VERI
    // FIX: Define the double stake amount using BigInt multiplication (2n)
    const MIN_STAKE_DOUBLE = MIN_STAKE * 2n;

    // Helper to advance time (using Hardhat Network Helpers)
    const time = {
        increase: async (seconds) => {
            await ethers.provider.send("evm_increaseTime", [seconds]);
            await ethers.provider.send("evm_mine");
        }
    };

    beforeEach(async function () {
        [owner, validator1, validator2, requester] = await ethers.getSigners();

        // 1. Deploy VERIToken
        VERIToken = await ethers.getContractFactory("VERIToken");
        veriToken = await VERIToken.deploy(INITIAL_SUPPLY);

        // 2. Deploy ValidatorRegistry
        ValidatorRegistry = await ethers.getContractFactory("ValidatorRegistry");
        validatorRegistry = await ValidatorRegistry.deploy(veriToken.target);

        // 3. Transfer tokens to validators for staking
        // FIX: Use the BigInt constant MIN_STAKE_DOUBLE
        await veriToken.transfer(validator1.address, MIN_STAKE_DOUBLE);
        await veriToken.transfer(validator2.address, MIN_STAKE);

        // 4. Validators approve the ValidatorRegistry to spend their tokens
        // FIX: Use the BigInt constant MIN_STAKE_DOUBLE
        await veriToken.connect(validator1).approve(validatorRegistry.target, MIN_STAKE_DOUBLE);
        await veriToken.connect(validator2).approve(validatorRegistry.target, MIN_STAKE);
    });

    // --- Registration Tests ---

    it("Should allow a user to register as a validator", async function () {
        await validatorRegistry.connect(validator1).registerValidator();

        const v1Info = await validatorRegistry.validators(validator1.address);
        expect(v1Info.isRegistered).to.be.true;
        expect(v1Info.stake).to.equal(MIN_STAKE);
        expect(await veriToken.balanceOf(validatorRegistry.target)).to.equal(MIN_STAKE);
        expect(await validatorRegistry.validatorAddresses(0)).to.equal(validator1.address);
    });

    it("Should revert if minimum stake is not approved", async function () {
        // validator1 unapproves, setting allowance to 0
        await veriToken.connect(validator1).approve(validatorRegistry.target, 0n); // Use 0n

        // FIX: The error comes from the external call to the VERIToken (ERC20) contract.
        // We must expect the OpenZeppelin ERC20 custom error on the veriToken instance.
        await expect(validatorRegistry.connect(validator1).registerValidator())
            .to.be.revertedWithCustomError(veriToken, "ERC20InsufficientAllowance");
    });

    it("Should revert if validator is already registered", async function () {
        await validatorRegistry.connect(validator1).registerValidator();
        await expect(validatorRegistry.connect(validator1).registerValidator())
            .to.be.revertedWithCustomError(validatorRegistry, "AlreadyRegistered");
    });

    // --- Staking and Unbonding Tests ---

    it("Should allow a registered validator to add stake", async function () {
        await validatorRegistry.connect(validator1).registerValidator();
        const addAmount = ethers.parseEther("50000"); // 50k VERI

        // Validator 1 adds the remaining 50k of their approved 100k
        await validatorRegistry.connect(validator1).addStake(addAmount);

        const v1Info = await validatorRegistry.validators(validator1.address);
        expect(v1Info.stake).to.equal(MIN_STAKE + addAmount);
        expect(await veriToken.balanceOf(validatorRegistry.target)).to.equal(MIN_STAKE + addAmount);
    });

    it("Should handle the full unbonding and withdrawal process", async function () {
        await validatorRegistry.connect(validator1).registerValidator();
        // const initialStake = await validatorRegistry.validators(validator1.address).then(v => v.stake); // No longer needed

        // 1. Request Unbond
        await validatorRegistry.connect(validator1).requestUnbond();
        
        // Check state change
        const requestTime = (await validatorRegistry.validators(validator1.address)).unbondRequestTime;
        expect(requestTime).to.be.greaterThan(0n); // Use 0n

        // 2. Try to withdraw too early
        await expect(validatorRegistry.connect(validator1).withdrawStake())
            .to.be.revertedWithCustomError(validatorRegistry, "UnbondingPeriodNotPassed");

        // 3. Advance time past the 7-day UNBONDING_PERIOD
        await time.increase(7 * 24 * 60 * 60 + 1);

        // 4. Withdraw Stake
        await validatorRegistry.connect(validator1).withdrawStake();

        // Check final state
        const v1Info = await validatorRegistry.validators(validator1.address);
        expect(v1Info.isRegistered).to.be.false;
        expect(v1Info.stake).to.equal(0n); // Use 0n
        // FIX: Use the BigInt constant MIN_STAKE_DOUBLE
        expect(await veriToken.balanceOf(validator1.address)).to.equal(MIN_STAKE_DOUBLE); // Original balance restored
        expect(await veriToken.balanceOf(validatorRegistry.target)).to.equal(0n); // Use 0n
    });

    // --- Protocol (Owner) Functions Tests ---

    it("Should allow owner to record validator accuracy", async function () {
        await validatorRegistry.connect(validator1).registerValidator();
        const accuracyScore = 9550; // 95.50%

        await validatorRegistry.recordAccuracy(validator1.address, accuracyScore);

        const v1Info = await validatorRegistry.validators(validator1.address);
        expect(v1Info.lastEpochAccuracy).to.equal(accuracyScore);
    });

    it("Should allow owner to slash a validator's stake", async function () {
        await validatorRegistry.connect(validator1).registerValidator();
        
        // Slash 50% (initial stake is 100,000 VERI)
        const slashPercentage = 50;
        // FIX: Use 2n for BigInt division
        const expectedSlashAmount = MIN_STAKE / 2n; 
        const deadAddress = "0x000000000000000000000000000000000000dEaD";

        const registryInitialBalance = await veriToken.balanceOf(validatorRegistry.target);

        await validatorRegistry.slashValidator(validator1.address, slashPercentage);

        // Check slashed amount was transferred out of the registry
        expect(await veriToken.balanceOf(validatorRegistry.target)).to.equal(registryInitialBalance - expectedSlashAmount);
        // Check validator's stake was updated
        expect((await validatorRegistry.validators(validator1.address)).stake).to.equal(MIN_STAKE - expectedSlashAmount);
        
        // In a real scenario, we'd check the dead address, but here we confirm the balance left the contract.
    });

    it("Should allow owner to distribute rewards (minting)", async function () {
        // NOTE: In a real system, the owner would grant minting authority to the ValidatorRegistry in a setup script.
        await veriToken.setProtocolAddress(validatorRegistry.target); // Grant minting authority

        const rewardAmount = ethers.parseEther("100");
        const v1InitialBalance = await veriToken.balanceOf(validator1.address);

        // Since the registry is simulating the protocol, we use the owner to call the function
        await validatorRegistry.distributeReward(validator1.address, rewardAmount);

        expect(await veriToken.balanceOf(validator1.address)).to.equal(v1InitialBalance + rewardAmount);
    });
});