# Installation — cPanel

🖥️

04

## Installation — cPanel

Follow this step-by-step guide to deploy Influner.com on a cPanel hosting environment. A full video walkthrough is also available below.

[

▶

### How to Setup Node.js App on cPanel

Click to watch on YouTube



](https://www.youtube.com/watch?v=FbAbltEPDHQ)

1

#### Upload Your Files

Log in to cPanel and navigate to **File Manager**. Upload the extracted application folder to your desired directory (e.g., `public_html` or a subdirectory).

2

#### Create a Node.js App

In cPanel, go to **Software → Setup Node.js App**. Click _Create Application_, select your Node.js version (20+), set the application root to your uploaded folder, and set the startup file to `server.js` (or as specified in your package).

3

#### Install Dependencies

In the Node.js App panel, click **Run NPM Install**. This will install all required packages automatically. Wait for the process to complete.

4

#### Start the Application

Click **Start App** in the Node.js App panel. Your application is now running. No environment variables need to be added manually.

5

#### Run the App Installer

Open your browser and navigate to `yourdomain.com/setup`. The built-in installer will automatically configure your database, environment, and admin account. Follow the on-screen steps to complete setup.

> **Note:**
> ✅
> 
> **You're Done!**After completing the installer at `/setup`, your platform is fully live. No database import, no `.env` file editing required.
> 
>