
# 🛡️ Veritas Protocol: Decentralized AI Verification

Veritas is a blockchain-based protocol that crowdsources the detection of AI-generated content. It utilizes a **Game Theoretic "Honeypot" Mechanism** to ensure miners (validators) classify images accurately without needing a central authority to verify every result.

This Proof of Concept (PoC) demonstrates a hybrid architecture:
1.  **On-Chain:** Trustless payments, staking, and immutable record-keeping.
2.  **Off-Chain:** High-performance AI processing and "Honeypot" consensus logic.

---

## 🧠 Core Mechanics: The Honeypot System

The protocol solves the "lazy validator" problem using a **Double-Blind** test:

1.  **Submission:** A user pays **$VRT** tokens to verify an image.
2.  **The Bundle:** An off-chain **Aggregator** creates a task bundle containing:
    * The User's Image (Unknown state).
    * X "Honeypot" Images (Known state: AI or Real).
3.  **Mining:** Miners classify the *entire* bundle. They do not know which image is the target and which are the honeypots.
4.  **Consensus:**
    * Miners who fail the honeypots are ignored (and can be slashed).
    * Miners who pass are assigned a **Confidence Weight**.
    * The final verdict is a **Weighted Average** of the passing miners.

---

## 📜 Smart Contract Architecture

The system relies on three interconnected contracts found in `contracts/`:

| Contract | Role | Key Functionality |
| :--- | :--- | :--- |
| `VeritasToken.sol` | **Economy** | ERC-20 Standard. Used for staking (skin-in-the-game) and fee payments. Includes `burn` logic for slashing bad actors. |
| `MinerRegistry.sol` | **Governance** | Manages miner identities. Enforces minimum stake requirements. Tracks reputation scores and handles slashing logic. |
| `VeritasCore.sol` | **Orchestration** | The central ledger. Receives user requests, holds fees, and accepts the final consensus result from the Aggregator to distribute rewards. |

---

## 📂 Project Structure


/contracts
  ├── VeritasToken.sol    # The Currency
  ├── MinerRegistry.sol   # The Workers
  └── VeritasCore.sol     # The Manager
/scripts
  ├── deploy.js           # Deploys the suite
  ├── miner_bot.js        # Simulates AI Miners (Registers & Listens)
  ├── aggregator.js       # Simulates the Oracle/Consensus Node
  └── user_submit.js      # Simulates a User paying for verification

-----

## 🛠️ Setup and Installation

1.  **Install Dependencies:**
    This project uses Hardhat and OpenZeppelin.

    ```bash
    npm install
    npm install @openzeppelin/contracts
    ```

2.  **Compile Contracts:**

    ```bash
    npx hardhat compile
    ```

-----

## 🔬 Running the Proof of Concept

This PoC simulates a live network with multiple actors. You will need **4 separate terminal windows** to see the full flow.

### Step 1: Start the Local Blockchain

**[Terminal 1]**
Start the Hardhat node. This creates a local blockchain and 20 test wallets.

```bash
npx hardhat node
```

*Keep this terminal running.*

### Step 2: Deploy Contracts

**[Terminal 2]**
Deploy the smart contracts.

```bash
npx hardhat run scripts/deploy.js --network localhost
```

⚠️ **IMPORTANT:** Copy the `VeritasToken`, `MinerRegistry`, and `VeritasCore` addresses output by this script. You **must** paste them into the top of `miner_bot.js`, `aggregator.js`, and `user_submit.js` before proceeding.

### Step 3: Start the Miners

**[Terminal 2]**
Run the bot script. This simulates 3 miners:

  * Miner A (High Accuracy)
  * Miner B (High Accuracy)
  * Miner C (Malicious/Low Accuracy)
    It will stake tokens, register them, and wait for work.

<!-- end list -->

```bash
npx hardhat run scripts/miner_bot.js --network localhost
```

### Step 4: Start the Aggregator

**[Terminal 3]**
Run the aggregator node. This listens for user requests, distributes "Honeypot" bundles, and calculates consensus.

```bash
npx hardhat run scripts/aggregator.js --network localhost
```

### Step 5: Submit a Request (The User)

**[Terminal 4]**
Simulate a user paying $VRT to verify an image.

```bash
npx hardhat run scripts/user_submit.js --network localhost
```

-----

## ✅ Expected Output Flow

1.  **Terminal 4 (User):** "Request Submitted\!"
2.  **Terminal 2 (Miners):** "[MINER BOT] Detected Request... Waiting for bundle."
3.  **Terminal 3 (Aggregator):**
      * `[NEW REQUEST DETECTED]`
      * `Dispatching to 3 miners...`
      * `Miner A: Pass` | `Miner B: Pass` | `Miner C: REJECTED (Low Accuracy)`
      * `> Consensus Reached: AI GENERATED`
      * `[TX] Result Finalized on-chain`

This proves the **Economic Flow** (Fees -\> Rewards) and the **Consensus Logic** (Filtering bad actors via Honeypots).

```
```