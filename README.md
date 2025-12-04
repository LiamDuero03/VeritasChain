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