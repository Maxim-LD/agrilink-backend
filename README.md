# AgriLink Backend 🌾

AgriLink is a smart digital bridge designed to connect rural farmers with aggregators, agro-dealers, and big-city buyers (factories, restaurants, etc.). By using simple SMS technology, AgriLink empowers farmers without internet or smartphones to sell their crops, buy seeds, and manage digital wallets, while bringing transparency and efficiency to the agricultural supply chain.

This repository contains the Node.js/Express backend powering the AgriLink platform.

---

## 🌟 Core Features & Functionalities

### 1. Dual Digital Wallets for Farmers

Every farmer on the platform has two wallets:

- **🛒 Agri-Wallet:** Locked funds intended exclusively for agricultural inputs (seeds, fertilizers). This ensures sustainable farming practices.
- **💵 Cash Wallet:** Unlocked, spendable money that can be withdrawn as cash for daily expenses.

### 2. Smart Pipeline & Revenue Splitting

- **Agri-Waste Pipeline (70/30 Split):** Sales of agricultural waste (e.g., cassava peels) split profits: 70% to the Agri-Wallet and 30% to the Cash Wallet, encouraging reinvestment in the farm.
- **Fresh Produce Pipeline (100% Cash):** Sales of fresh produce go 100% into the Cash Wallet to cover immediate harvest and transport costs.

### 3. SMS-Based Interactions

Farmers interact with the platform entirely via SMS text codes (using Telnyx/Vonage integrations). They can:

- Check balances (`BAL`)
- Redeem inputs from local dealers (`REDEEM <amount> <dealer_code>`)
- Withdraw cash (`WITHDRAW <amount>`)

### 4. AI-Powered Matching Engine

The matching engine connects Aggregator logs (crop supply) with Buyer Standing Orders (crop demand). It is designed as an **AI-driven Smart Matchmaker** to analyze historical data, live weather, and market demand to suggest matches and dynamically negotiate prices. *(Note: Due to insufficient historical training data at this early stage, it currently operates on a temporary rule-based fallback using weight, distance, and price thresholds).*

### 5. Role-Based Ecosystem

- **Farmers:** Sell crops and buy inputs via SMS.
- **Aggregators:** Use a mobile app to weigh crops, take photos, and log harvests with GPS.
- **Buyers (Factories/Restaurants):** Set up standing orders and confirm matches via the dashboard.
- **Agro-Dealers:** Validate farmer OTPs to sell seeds and fertilizers.
- **Admins:** Oversee the platform, approve dealers, and handle disputes.

---

## 🤖 AI Functionalities & Roadmap

AgriLink is designed to leverage Large Language Models (LLMs) and specialized AI to automate and optimize the agricultural supply chain. These AI features are crucial for scaling the platform:

1. **Natural Language SMS Parser (NLP):**

   - **Feature:** Allows farmers to send free-text SMS messages in their native languages or informal slang (e.g., Pidgin English, Yoruba) instead of strict command codes.
   - **How it works:** An LLM understands the intent ("I wan take out three thousand") and translates it into the system action (`WITHDRAW 3000`).
2. **Crop Quality Grader (Vision AI):**

   - **Feature:** Replaces manual grading by aggregators.
   - **How it works:** Multimodal Vision-Language Models (like Gemini) analyze crop photos uploaded by aggregators to detect freshness, bruises, rot, or diseases, automatically suggesting dynamic pricing adjustments.
3. **Smart Matchmaker & Dynamic Price Negotiator:**

   - **Feature:** Upgrades the rigid math-based matching engine.
   - **How it works:** An LLM Agent analyzes historical data, live weather, and market demand to suggest the best buyer-seller matches and negotiate prices to cover transport costs fairly.
4. **Hyper-Personalized Farm Advisories:**

   - **Feature:** Automated, predictive SMS alerts for farmers.
   - **How it works:** The system correlates local soil reports and live weather data to generate and text timely advice (e.g., "Heavy rain coming, harvest your tomatoes today!").
5. **AI Dispute Referee:**

   - **Feature:** Instant resolution of buyer-aggregator conflicts.
   - **How it works:** The AI reviews buyer complaints against original aggregator photos and transaction histories to recommend fair, unbiased resolutions (e.g., partial refunds).

---

## 🛠 Tech Stack

- **Framework:** Node.js, Express.js
- **Language:** TypeScript
- **Database:** MongoDB (Mongoose)
- **Authentication:** JWT, bcrypt
- **SMS & Communications:** Telnyx API, Vonage API
- **Media Storage:** Cloudinary
- **Task Scheduling:** node-cron

---

## 🚀 Setup & Installation

### Prerequisites

- Node.js (v18+)
- MongoDB cluster (or local instance)
- API Keys for Telnyx/Vonage and Cloudinary

### Steps

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd agrilink-backend
   ```
2. **Install dependencies**

   ```bash
   npm install
   ```
3. **Configure Environment Variables**
   Create a `.env` file in the root directory based on `.env.example`:

   ```bash
   cp .env.example .env
   ```

   *Fill in your MongoDB URI, JWT Secret, and relevant API keys.*
4. **Seed the Database (Optional)**

   ```bash
   npm run seed
   ```
5. **Run the Development Server**

   ```bash
   npm run dev
   ```

   The server will start on the port specified in your `.env` (default is 5000).

---

## 📄 License

ISC
