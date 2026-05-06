# Deployment Guide: Hostinger VPS & GoDaddy Domain

This guide will walk you through the complete process of deploying the **Influner AI** application on a Hostinger VPS using a domain registered on GoDaddy.

---

## 1. Prerequisites
- A **Hostinger VPS** (Ubuntu 22.04 or 24.04 recommended).
- A **GoDaddy Domain**.
- Basic knowledge of the terminal (SSH).

---

## 2. Pointing GoDaddy Domain to Hostinger
Before setting up the server, you need to point your domain to your VPS IP address.

1.  Log in to your **GoDaddy DNS Management** panel.
2.  Find the **A Record** with the name `@`.
3.  Change its **Value** to your Hostinger VPS IP Address.
4.  (Optional) Find the **CNAME Record** with name `www` and point it to `@`.
5.  Save changes. *Note: DNS propagation can take anywhere from a few minutes to 24 hours.*

---

## 3. Server Environment Setup
Connect to your VPS via SSH:
```bash
ssh root@your_vps_ip
```

### Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### Install Node.js (LTS)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Install MySQL Server
```bash
sudo apt install mysql-server -y
```

### Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
```

### Install Nginx
```bash
sudo apt install nginx -y
```

---

## 4. Database Configuration
Log in to MySQL:
```bash
sudo mysql
```

Run the following SQL commands to create a database and user:
```sql
CREATE DATABASE influner_db;
CREATE USER 'influner_user'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON influner_db.* TO 'influner_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 5. App Deployment

### Upload Code
You can either use `git clone` or upload files via SFTP (FileZilla). 
Assuming you are in `/var/www/`:
```bash
cd /var/www
# If using git:
git clone https://github.com/ovishkh/influner.com.git
cd influner.com
```

### Install Dependencies
```bash
npm install
```

### Check Permissions
Ensure the server can write to necessary directories:
```bash
sudo chown -R $USER:$USER /var/www/influner.com
```

---

## 6. Nginx & SSL Setup

### Configure Nginx Reverse Proxy
Create a new configuration file:
```bash
sudo nano /etc/nginx/sites-available/influner.com
```

Paste the following configuration (replace `yourdomain.com` with your actual domain):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:8001; # Matches the port in config.json
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the configuration:
```bash
sudo ln -s /etc/nginx/sites-available/influner.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Install SSL (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 7. Running the Application

### Start with PM2
```bash
pm2 start server.js --name "influner"
pm2 save
pm2 startup
```

---

## 8. Final Setup Wizard
Once the app is running and your domain is pointed, visit:
`https://yourdomain.com/setup`

1.  **Database Connection**: Enter the MySQL details you created in Step 4.
2.  **Initialize**: The system will automatically create the necessary tables.
3.  **Admin Account**: Create your initial admin credentials.

---

## Troubleshooting
- **Port Conflict**: If the app doesn't start, check if port 8001 is already in use.
- **Logs**: View application logs using `pm2 logs influner`.
- **Nginx Errors**: Check Nginx logs at `/var/log/nginx/error.log`.
- **MySQL Connection**: Ensure the user/password in `config.json` (created by the setup wizard) matches your MySQL user.
