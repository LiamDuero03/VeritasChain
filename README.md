
# 🛡️ VeritasChain MVP: Proof of Validation (PoV) Protocol

VeritasChain is a novel blockchain protocol introducing **Proof of Validation (PoV)**, a consensus mechanism that ties validator rewards and network authority directly to verifiable, useful work.

This Minimum Viable Product (MVP), built using **Hardhat**, demonstrates the core economic and governance mechanics of the PoV lifecycle: classifying digital content as **Authentic** or **AI-Generated**.

---

## 💡 Protocol Core Mechanics

The PoV mechanism simulates staking, transaction fees, rewards, and a competitive leader election process to ensure utility and integrity within the network.

### 📜 Contract Architecture

The MVP utilizes three interconnected contracts to model the full lifecycle of a content certification request:

| Contract | Core Role | PoV Mechanism Demonstrated |
| :--- | :--- | :--- |
| `VERIToken.sol` | **Native Currency (ERC-20)** | Handles all financial flows: staking, fees, rewards, and the Token Burn mechanism. |
| `ValidatorRegistry.sol` | **Economic Security & Leader Selection** | Manages validator stake, enforces slashing, records accuracy, and simulates the competitive Epoch/Leader Election based on recorded performance. |
| `CertificationRegistry.sol` | **Service & Verification Layer** | Processes user fee payments, stores immutable content hashes, and enables the elected Leader to finalize the content classification. |

---

## 🔑 Key PoV Logic Demonstration

The PoC links validator **performance (accuracy)** to **network authority** through a decentralized, merit-based selection process.

### 1. Leader Election (`ValidatorRegistry.sol`)

The `completeEpochChallenge` function simulates the off-chain PoV work results (content classification accuracy) and elects a new leader:

```solidity
// Called by Owner to simulate off-chain results and elect a new leader
function completeEpochChallenge(address[] calldata validatorList, uint256[] calldata accuracyScores) 
    public onlyOwner 
{
    // ... Calculates maxScore and selects highest-accuracy/highest-stake validator ...
    currentEpochLeader = potentialLeader;
    // ...
}
´´´

### 2\. Verification Authority (`CertificationRegistry.sol`)

The `finalizeCertification` function ensures that **only** the currently elected leader—the validator who demonstrated the highest accuracy in the previous epoch—has the power to finalize the immutable classification:

```solidity
// ONLY callable by the elected currentEpochLeader
function finalizeCertification(bytes32 contentHash, CertificationStatus finalStatus) 
    public 
{
    // Authority Check: Reverts if the sender is not the current PoV leader
    if (!validatorRegistry.isCurrentEpochLeader(msg.sender)) {
        revert NotEpochLeader();
    }
    // ... records finalStatus (CertifiedAuthentic/CertifiedAI) ...
}
```

This separation of concerns fulfills the core promise of PoV: **power to produce certified results is restricted to the most accurate validator.**

-----

## 🛠️ Setup and Installation

This project requires **Node.js** and **npm**, utilizing **Hardhat** for local development and testing.

### Steps

1.  **Navigate to the Project Folder and Install Dependencies:**
    ```bash
    cd VeritasChain-MVP
    npm install
    ```
2.  **Compile Smart Contracts:**
    ```bash
    npx hardhat compile
    ```

-----

## 🔬 Running the Proof of Concept

This section details how to run the Hardhat network and execute the core logic script.

### 1\. Start a Local Hardhat Node

Run the Hardhat network in one terminal window. This provides a local environment for deployment:

```bash
npx hardhat node
```

### 2\. Run the Deployment/Interaction Script

In a **separate terminal window**, execute the main script (assuming your main script is named `run.js` or similar, located in the `scripts/` directory). This script typically deploys the contracts and runs a basic interaction sequence:

```bash
npx hardhat run scripts/run.js --network localhost
```

**Note:** *Adjust `scripts/run.js` to match the actual path and name of your main execution script.*

### 3\. Comprehensive Testing

The comprehensive test suite verifies the PoC's functionality, simulating the full economic and governance lifecycle from validator registration and staking to final content verification.

To run all tests:

```bash
npx hardhat test
```

### Expected Successful Output

A successful run (either the script or the tests) confirms the following core functionalities:

  * ✅ **Validator Lifecycle:** Correct simulation of staking, unbonding, and slashing.
  * ✅ **Economic Flow:** Accurate fee calculation, distribution (80% validator share), and the mandatory 20% token burn.
  * ✅ **PoV Mechanism:** Authority is correctly restricted; only the elected **Epoch Leader** can finalize a certification, linking network power directly to measured useful work.

<!-- end list -->
