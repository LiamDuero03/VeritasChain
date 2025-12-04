const { ethers } = require("hardhat");

async function main() {
    // We use validator1 as the validator, and owner as the Protocol Admin/Leader
    const [owner, validator1, requester] = await ethers.getSigners();
    console.log("--- Deployment and PoV Interaction Simulation (Simple) ---");
    console.log("Deploying contracts with the owner account:", owner.address);

    // --- 1. DEPLOYMENT ---
    const MIN_STAKE = ethers.parseEther("100000");
    const IMAGE_FEE = ethers.parseEther("0.01");
    const CONTENT_HASH = ethers.keccak256(ethers.toUtf8Bytes("example-ai-content"));
    const ContentType = { Image: 0, Video: 1 };
    // Note: CertifiedAuthentic is 1
    const CertificationStatus = { Pending: 0, CertifiedAuthentic: 1, CertifiedAI: 2 };

    const VERIToken = await ethers.getContractFactory("VERIToken");
    const veriToken = await VERIToken.deploy(ethers.parseEther("10000000"));
    
    const ValidatorRegistry = await ethers.getContractFactory("ValidatorRegistry");
    const validatorRegistry = await ValidatorRegistry.deploy(veriToken.target);

    const CertificationRegistry = await ethers.getContractFactory("CertificationRegistry");
    // NOTE: This assumes CertificationRegistry is the version with the old `finalizeCertification` signature:
    // `function finalizeCertification(bytes32 contentHash, CertificationStatus finalStatus, address leaderAddress) public onlyOwner`
    const certificationRegistry = await CertificationRegistry.deploy(veriToken.target, validatorRegistry.target);

    console.log(`VERIToken deployed to: ${veriToken.target}`);
    console.log(`ValidatorRegistry deployed to: ${validatorRegistry.target}`);
    console.log(`CertificationRegistry deployed to: ${certificationRegistry.target}`);

    // --- 2. SETUP AND STAKING (PoV Security) ---
    await veriToken.transfer(validator1.address, MIN_STAKE * 2n);
    await veriToken.connect(validator1).approve(validatorRegistry.target, MIN_STAKE);
    
    console.log("\n[SETUP] Validator 1 registering and staking...");
    await validatorRegistry.connect(validator1).registerValidator();
    console.log(`Validator 1 staked ${ethers.formatEther(MIN_STAKE)} VERI.`);
    
    // --- 3. SIMULATE ACCURACY RECORDING ---
    // Owner simulates the protocol tracking the validator's performance score
    const accuracy = 9500; // 95.00% accuracy score

    console.log(`[PoV TRACKING] Owner records accuracy score ${accuracy} for Validator 1...`);
    // FIX: Calling the existing `recordAccuracy` function in your contract
    await validatorRegistry.connect(owner).recordAccuracy(
        validator1.address,
        accuracy
    );
    
    const recordedAccuracy = await validatorRegistry.validators(validator1.address).then(v => v.lastEpochAccuracy);
    console.log(`Validator 1 last accuracy recorded: ${recordedAccuracy}`);
    
    // --- 4. CONTENT SUBMISSION & FEE PAYMENT ---
    await veriToken.transfer(requester.address, IMAGE_FEE * 5n); // Fund requester
    await veriToken.connect(requester).approve(certificationRegistry.target, IMAGE_FEE);
    
    console.log("\n[SERVICE] Requester submits content for certification (pays fee)...");
    await certificationRegistry.connect(requester).submitCertification(
        CONTENT_HASH,
        ContentType.Image,
        0,
        IMAGE_FEE
    );
    console.log(`Content hash submitted. Status is now PENDING.`);
    
    // --- 5. FINALIZATION (Admin Authority) ---
    // The Owner (acting as the centralized block producer in this simplified model) finalizes the result.
    console.log("\n[FINALIZATION] Owner (Admin) posts the final classification (Certified Authentic)...");
    
    // NOTE: This call assumes the old CertificationRegistry signature with `leaderAddress` argument.
    await certificationRegistry.connect(owner).finalizeCertification(
        CONTENT_HASH,
        CertificationStatus.CertifiedAuthentic,
        validator1.address // The validator who performed the work
    );

    const finalStatus = await certificationRegistry.certifications(CONTENT_HASH).then(c => c.status);
    console.log(`Certification finalized! Final Status ID: ${finalStatus} (Certified Authentic)`);
    console.log(`PoC Demonstrated: Admin posts result based on tracked PoV score.`);

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});