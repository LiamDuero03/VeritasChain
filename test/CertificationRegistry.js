const { expect } = require("chai");
const { ethers } = require("hardhat"); // <-- FIXED: Removed erroneous '=' assignment

describe("CertificationRegistry", function () {
    let VERIToken;
    let ValidatorRegistry;
    let CertificationRegistry;
    let veriToken;
    let validatorRegistry;
    let certificationRegistry;
    let owner;
    let validator1;
    let requester1;
    let otherUser;

    const INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10 million VERI
    const IMAGE_FEE = ethers.parseEther("0.01");
    const VIDEO_FEE_PER_MINUTE = ethers.parseEther("0.10");
    const deadAddress = "0x000000000000000000000000000000000000dEaD"; // For the burn
    const ContentType = { Image: 0, Video: 1 };
    const CertificationStatus = { Pending: 0, CertifiedAuthentic: 1, CertifiedAI: 2 };

    beforeEach(async function () {
        [owner, validator1, requester1, otherUser] = await ethers.getSigners();

        // 1. Deploy VERIToken
        VERIToken = await ethers.getContractFactory("VERIToken");
        veriToken = await VERIToken.deploy(INITIAL_SUPPLY);

        // 2. Deploy ValidatorRegistry (needed for fee distribution address)
        ValidatorRegistry = await ethers.getContractFactory("ValidatorRegistry");
        validatorRegistry = await ValidatorRegistry.deploy(veriToken.target);

        // 3. Deploy CertificationRegistry
        CertificationRegistry = await ethers.getContractFactory("CertificationRegistry");
        certificationRegistry = await CertificationRegistry.deploy(veriToken.target, validatorRegistry.target);

        // 4. Fund requester1
        const requesterBalance = ethers.parseEther("100");
        await veriToken.transfer(requester1.address, requesterBalance);

        // 5. Requester approves CertificationRegistry to spend funds
        await veriToken.connect(requester1).approve(certificationRegistry.target, requesterBalance);
    });

    // --- Submission and Fee Logic Tests ---

    it("Should successfully process an image certification and distribute fees", async function () {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes("ai-image-001"));
        const totalFee = IMAGE_FEE;
        // Use BigInt (n suffix) for division/percentage calculation
        const burnAmount = (totalFee * 20n) / 100n; // 20%
        const validatorShare = totalFee - burnAmount; // 80%

        const requesterInitialBalance = await veriToken.balanceOf(requester1.address);
        const registryInitialBalance = await veriToken.balanceOf(certificationRegistry.target);
        const validatorInitialBalance = await veriToken.balanceOf(validatorRegistry.target);

        // 1. Submit Certification
        await certificationRegistry.connect(requester1).submitCertification(
            contentHash,
            ContentType.Image,
            0, // videoMinutes
            totalFee
        );

        // 2. Check content recorded and status is PENDING
        const certification = await certificationRegistry.certifications(contentHash);
        expect(certification.requester).to.equal(requester1.address);
        expect(certification.status).to.equal(CertificationStatus.Pending); // New check
        expect(await certificationRegistry.getCertifiedContentCount()).to.equal(1n);

        // 3. Check token movement: Requester balance decreased
        expect(await veriToken.balanceOf(requester1.address)).to.equal(requesterInitialBalance - totalFee);

        // 4. Check token movement: Validator Registry received 80% share
        expect(await veriToken.balanceOf(validatorRegistry.target)).to.equal(validatorInitialBalance + validatorShare);
        
        // 5. Check token movement: Dead Address (Burn) received 20%
        expect(await veriToken.balanceOf(deadAddress)).to.equal(burnAmount);
    });

    it("Should successfully process a video certification (5 minutes)", async function () {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes("deepfake-video-A"));
        const videoMinutes = 5n; // Use BigInt for multiplication
        const totalFee = VIDEO_FEE_PER_MINUTE * videoMinutes; // 0.10 * 5 = 0.5 VERI

        // 1. Submit Certification
        await certificationRegistry.connect(requester1).submitCertification(
            contentHash,
            ContentType.Video,
            Number(videoMinutes),
            totalFee
        );

        // 2. Check content recorded
        const certification = await certificationRegistry.certifications(contentHash);
        expect(certification.status).to.equal(CertificationStatus.Pending);
    });

    it("Should revert if content is already certified", async function () {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes("ai-image-001"));

        // First successful certification
        await certificationRegistry.connect(requester1).submitCertification(
            contentHash,
            ContentType.Image,
            0,
            IMAGE_FEE
        );

        // Second attempt should revert
        await expect(certificationRegistry.connect(requester1).submitCertification(
            contentHash,
            ContentType.Image,
            0,
            IMAGE_FEE
        )).to.be.revertedWithCustomError(certificationRegistry, "AlreadyCertified");
    });

    it("Should revert if submitted fee is too low", async function () {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes("low-fee-test"));
        const lowFee = IMAGE_FEE - 1n; // 1 wei less than required (use 1n for BigInt subtraction)

        await expect(certificationRegistry.connect(requester1).submitCertification(
            contentHash,
            ContentType.Image,
            0,
            lowFee
        )).to.be.revertedWithCustomError(certificationRegistry, "FeeTooLow");
    });

    // --- PoV Finalization Tests (New Functionality) ---

    it("Should allow the owner to finalize certification as Authentic", async function () {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes("authentic-photo"));
        const leaderAddress = validator1.address;
        
        // 1. Submit content (sets status to Pending)
        await certificationRegistry.connect(requester1).submitCertification(
            contentHash,
            ContentType.Image,
            0,
            IMAGE_FEE
        );

        // 2. Finalize as CertifiedAuthentic (Status = 1)
        const tx = await certificationRegistry.connect(owner).finalizeCertification(
            contentHash,
            CertificationStatus.CertifiedAuthentic,
            leaderAddress
        );

        // Check event emission
        await expect(tx).to.emit(certificationRegistry, "ContentCertifiedFinalized")
            .withArgs(contentHash, CertificationStatus.CertifiedAuthentic, leaderAddress);

        // Check status update
        const finalCert = await certificationRegistry.certifications(contentHash);
        expect(finalCert.status).to.equal(CertificationStatus.CertifiedAuthentic);
        expect(finalCert.finalValidator).to.equal(leaderAddress);
        expect(finalCert.finalizationTimestamp).to.be.greaterThan(0n);
    });

    it("Should allow the owner to finalize certification as AI-Generated", async function () {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes("ai-generated-text"));
        const leaderAddress = validator1.address;
        
        // 1. Submit content
        await certificationRegistry.connect(requester1).submitCertification(
            contentHash,
            ContentType.Image,
            0,
            IMAGE_FEE
        );

        // 2. Finalize as CertifiedAI (Status = 2)
        await certificationRegistry.connect(owner).finalizeCertification(
            contentHash,
            CertificationStatus.CertifiedAI,
            leaderAddress
        );

        // Check status update
        const finalCert = await certificationRegistry.certifications(contentHash);
        expect(finalCert.status).to.equal(CertificationStatus.CertifiedAI);
    });

    it("Should revert if a non-owner tries to finalize certification", async function () {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes("unauthorized-finalize"));

        // 1. Submit content
        await certificationRegistry.connect(requester1).submitCertification(
            contentHash,
            ContentType.Image,
            0,
            IMAGE_FEE
        );

        // 2. Attempt to finalize as non-owner (otherUser)
        // FIX: The latest OpenZeppelin Ownable contract throws the custom error OwnableUnauthorizedAccount(address).
        await expect(certificationRegistry.connect(otherUser).finalizeCertification(
            contentHash,
            CertificationStatus.CertifiedAuthentic,
            otherUser.address
        )).to.be.revertedWithCustomError(certificationRegistry, "OwnableUnauthorizedAccount")
            .withArgs(otherUser.address);
    });
});