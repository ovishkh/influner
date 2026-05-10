# Installation — aaPanel

⚙️

05

## Installation — aaPanel

Prefer aaPanel? The process is equally straightforward. Watch the video guide below for a complete walkthrough.

[

▶

### How to Setup Node.js App on aaPanel

Click to watch on YouTube



](https://www.youtube.com/watch?v=wg7zsc4-A84)

1

#### Upload Files via File Manager

Log in to aaPanel and use the **File Manager** or FTP to upload your application files to your server directory (e.g., `/www/wwwroot/yourdomain.com`).

2

#### Create a Node.js Project

In aaPanel, go to **App Store → Node.js Version Manager** (or use the Node.js project manager). Create a new project pointing to your application directory. Select Node.js 18+ and set the entry file.

3

#### Install Dependencies & Start

Run `npm install` from the terminal or the aaPanel Node.js interface. Once complete, start the application using the panel's start button or `pm2`.

4

#### Run the App Installer

Visit `yourdomain.com/setup` in your browser. The installer handles all database creation, configuration, and initial admin setup automatically.

> **Note:**
> 💡
> 
> **Pro Tip**Use **PM2** (process manager) on aaPanel to keep your Node.js app running persistently even after server reboots. Install it with `npm install -g pm2`.
> 
>