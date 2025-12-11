
# 🛡️ Veritas Protocol: Decentralized AI Verification

Veritas is a blockchain-based protocol that crowdsources the detection of AI-generated content. It utilizes a **Game Theoretic "Honeypot" Mechanism** to ensure miners (validators) classify images accurately without needing a central authority to verify every result.

This Proof of Concept (PoC) demonstrates a hybrid architecture:
1.  **On-Chain:** Trustless payments, staking, immutable record-keeping, and proportional reward distribution.
2.  **Off-Chain:** High-performance AI processing and "Double-Blind" consensus logic.

---

## 🧠 Core Mechanics: The Honeypot System

The protocol solves the "lazy validator" problem using a **Double-Blind** test:

1.  **Submission:** A user pays **$VRT** tokens to verify an image.
2.  **The Bundle:** An off-chain **Aggregator** creates a task bundle containing:
    * The User's Image (Unknown state).
    * X "Honeypot" Images (Known state: AI or Real).
3.  **Mining:** Miners classify the *entire* bundle. They do not know which image is the target and which are the honeypots.
4.  **Consensus & Rewards:**
    * **Filtering:** Miners who fail the honeypots are ignored.
    * **Selection:** Only the top-performing committee (e.g., Top 3) is selected.
    * **Proportional Payout:** Rewards are distributed based on accuracy (better performance = higher payout).

---

## 📜 Smart Contract Architecture

The system relies on three interconnected contracts found in `contracts/`:

| Contract | Role | Key Functionality |
| :--- | :--- | :--- |
| `VeritasToken.sol` | **Economy** | ERC-20 Standard. Used for staking (skin-in-the-game) and fee payments. |
| `MinerRegistry.sol` | **Governance** | Manages miner identities and enforces minimum stake requirements. Tracks on-chain **Reputation Scores** (Wins/Losses). |
| `VeritasCore.sol` | **Orchestration** | The central ledger. Receives user requests, holds fees, and accepts the final consensus result from the Aggregator to distribute **Proportional Rewards**. |

---

## 📂 Project Structure

```text
/contracts
  ├── VeritasToken.sol    # The Currency
  ├── MinerRegistry.sol   # The Workers & Reputation
  └── VeritasCore.sol     # The Logic & Payouts

/scripts
  └── simulation_v1.js    # MASTER SIMULATION (Deploys, Registers, Runs Consensus)

/data
  ├── test_pool.json      # Input data (Images to verify)
  └── request_pool.json   # Output data (Final verdicts stored here)
```

-----

## 🛠️ Setup and Installation

1.  **Install Dependencies:**
    This project uses Hardhat and OpenZeppelin.

    ```bash
    npm install
    npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts
    ```

2.  **Compile Contracts:**
    Ensure the Solidity code compiles correctly.

    ```bash
    npx hardhat compile
    ```

-----

## 🔬 Running the Proof of Concept (End-to-End Demo)

For this MVP, the entire protocol lifecycle—from deployment to miner registration, user submission, and consensus—is consolidated into a single **Simulation Script**. This proves the logic works end-to-end without needing to manage multiple terminal windows.

**Run the full system demonstration:**

```bash
npx hardhat run scripts/simulation_v1.js
```

### 📊 What You Will See (Expected Output)

The script simulates a live network processing a batch of images. Watch the terminal for these key events:

1.  **Deployment:** Contracts are deployed and linked.
2.  **Registration:** 10 Miners stake `$VRT` to join the network.
3.  **Blind Batching:** Each request is processed against 10 "Honeypot" images.
4.  **Consensus:** The system sorts miners by accuracy and selects the **Top 3**.
5.  **Proportional Payout:**
    ```text
    [Payout] 💰 Proportional Rewards (Based on Accuracy):
       -> Miner 0x123... (100% Acc) received 2.8571 VRT
       -> Miner 0x456... (90% Acc) received 2.5714 VRT
    ```
6.  **Economic Security:**
      * If a user runs out of funds, the script catches the `ERC20InsufficientAllowance` error, proving the contract correctly rejects unpaid work.

-----

## 📝 Data Seeding (Optional)

To test specific scenarios, you can add custom "images" to `data/test_pool.json`:

```json
[
  { "hash": "Qm_My_Test_Image", "trueLabel": true, "status": "pending" }
]
```

The simulation will automatically load these files, process them on the blockchain, and write the final verdict (AI/Real) to `data/request_pool.json`.

```
```