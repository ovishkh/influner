# Influner.com

Influner.com is a comprehensive AI-powered platform for generating and managing virtual influencers, photo galleries, and video content (reels and product showcases). It provides a full-stack SaaS ecosystem with a seamless user experience, credit-based subscription plans, and an advanced administrative dashboard.

## 🌟 Key Features

### 🤖 Influencer Generation
- **Text-to-Image (Influencer Maker)**: Generate highly realistic, consistent virtual influencers using state-of-the-art models (e.g., Flux-2 Pro).
- **Image-to-Image (Gallery)**: Create variations and new lifestyle photos based on an existing AI influencer.

### 🎥 AI Video Content
- **Reel Maker**: Bring your influencers to life with motion-controlled video generation (using Kling models).
- **Product Showcase**: Seamlessly insert your virtual influencer into product showcases using AI-driven video composition.

### 💳 SaaS & Monetization
- **Subscription Plans**: Flexible credit-based system.
- **Multiple Payment Gateways**: Built-in support for **Stripe**, **PayPal**, **Razorpay**, **Paystack**, and **MercadoPago**, plus offline payment instructions.
- **Usage Tracking**: Comprehensive logging of user activities and credit consumption.

### 🛡️ Admin & Security
- **Dynamic Setup Wizard**: Initial database and admin setup through a visual interface (`/setup`).
- **Comprehensive Admin Panel**: Manage users, AI provider APIs, email settings, payment methods, blogs, and support messages.
- **JWT Authentication**: Secure, token-based authentication with bcrypt password hashing and token invalidation on password resets.
- **Email Delivery**: Built-in SMTP support for welcome emails, password recoveries, and usage updates.

## 🛠️ Technology Stack
- **Backend**: Node.js, Express.js
- **Database**: MySQL (mysql2/promise)
- **Authentication**: JWT, bcrypt
- **File Processing**: Sharp, ffmpeg-static
- **AI Integrations**: Native support for Kie.ai and customizable endpoints for other text/image/video generation services.

## 🚀 Deployment Guide

### Prerequisites
- VPS (Ubuntu 24.04 recommended)
- Node.js (v20+) & npm
- MySQL 8.0+
- Nginx
- PM2 (for process management)

### Step 1: Clone & Install
```bash
git clone https://github.com/ovishkh/influner.com.git
cd influner.com
npm install
```

### Step 2: Database Setup
Create an empty database and user in MySQL:
```sql
CREATE DATABASE influner_db;
CREATE USER 'influner_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON influner_db.* TO 'influner_user'@'localhost';
FLUSH PRIVILEGES;
```

### Step 3: Run the Application
Start the app using PM2:
```bash
pm2 start server.js --name influner
pm2 save
```
*Note: By default, the application runs on port `8001` or `4003` depending on your environment configuration.*

### Step 4: Finalize Setup
Navigate to `http://yourdomain.com/setup` (or the IP address) in your browser. The built-in setup wizard will:
1. Connect to your database using the credentials you provide.
2. Automatically create all necessary tables and columns.
3. Generate your JWT secret.
4. Set up your master Admin Account.

## 📖 Project Documentation
Check the `/docs` folder for detailed infrastructure configuration:
- `deployment.md`: Detailed step-by-step VPS configuration and Nginx setup.
- `next_steps.md`: Post-deployment configuration for AI providers and payment gateways.

## 🔒 Security
- Ensure `config.json` and `.env` are added to `.gitignore`.
- Run the app behind Nginx with an SSL certificate provided by Let's Encrypt (Certbot).
- Protect your `VPS` details by rotating passwords.

---
**Maintained by:** Ovishkh
