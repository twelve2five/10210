# WhatsApp Lead Agent 🚀

A powerful WhatsApp automation tool for managing leads, campaigns, and group interactions. Built with Python FastAPI and WAHA (WhatsApp HTTP API) running in Docker containers.

## 🌟 Features

### Lead Management
- 📊 Import leads from CSV files with custom field mapping
- 👥 Manage participants across multiple WhatsApp groups
- 📈 Track lead engagement and response rates
- 🔄 Bulk operations for adding/removing participants

### Campaign Management
- 📢 Create and manage marketing campaigns
- 📝 Schedule messages to groups and individuals
- 🎯 Target specific participant segments
- 📊 Export campaign results in multiple formats (CSV, JSON, Excel)

### Group Warming
- 🔥 Automated group engagement to prevent WhatsApp restrictions
- 💬 Smart message scheduling with random delays
- 🎭 Multiple message templates to avoid detection
- ⏱️ Configurable warming intervals and patterns

### Advanced Features
- 🤖 Real-time WhatsApp session management
- 📸 QR code authentication
- 💾 SQLite database for persistent data storage
- 🌐 Web-based dashboard interface
- 🔄 WebSocket support for real-time updates

## 📋 Prerequisites

- **Docker Desktop** (Windows/Mac/Linux)
- **Git** (for cloning the repository)
- **8GB RAM minimum** (recommended 16GB for handling 20+ groups)
- **Good internet connection** for WhatsApp synchronization

## 🚀 Quick Start

### 1. Install Docker Desktop

**Windows/Mac:**
1. Download Docker Desktop from [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
2. Run the installer and follow the setup wizard
3. Start Docker Desktop
4. Wait for Docker to fully initialize (icon should be steady, not animated)

**Linux:**
```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect
```

### 2. Clone the Repository

```bash
git clone <your-github-repo-url>
cd whatsapp-lead-agent
```

### 3. Configure Environment (Optional)

Create a `.env` file if you want to customize settings:

```env
# WAHA Configuration
WAHA_API_KEY=your-api-key-here  # Optional, for secured WAHA instances

# Application Settings
DEBUG=false
LOG_LEVEL=info
```

### 4. Start the Application

```bash
# Start all services using Docker Compose
docker-compose up -d

# Or use the provided start script
python start.py
```

This will:
- Pull the WAHA Plus Docker image
- Build the WhatsApp Agent container
- Start both services with proper networking
- Create persistent volumes for data storage

### 5. Access the Dashboard

Open your browser and navigate to:
- **WhatsApp Agent Dashboard**: [http://localhost:8000](http://localhost:8000)
- **WAHA API** (if needed): [http://localhost:4500](http://localhost:4500)

## 📖 Usage Guide

### Initial Setup

1. **Connect WhatsApp**:
   - Go to Sessions tab
   - Click "Create New Session"
   - Scan the QR code with WhatsApp mobile
   - Wait for connection confirmation

2. **Import Groups**:
   - Navigate to Groups section
   - Your connected groups will auto-populate
   - Select groups to manage

3. **Import Leads**:
   - Go to Import section
   - Upload CSV file with participant data
   - Map CSV columns to database fields
   - Click Import

### Managing Campaigns

1. **Create Campaign**:
   - Navigate to Campaigns
   - Click "New Campaign"
   - Select target groups
   - Configure message templates
   - Set schedule (optional)

2. **Monitor Progress**:
   - View real-time statistics
   - Track delivery rates
   - Export results

### Group Warming

1. **Enable Warming**:
   - Go to Warmer section
   - Select groups to warm
   - Configure intervals (recommended: 2-4 hours)
   - Choose message templates
   - Start warming

2. **Best Practices**:
   - Start with longer intervals (4 hours)
   - Use varied message templates
   - Avoid warming more than 20 groups per session
   - Monitor CPU usage in Docker Desktop

## 🔧 Performance Optimization

### For High Group Counts (20+ groups)

1. **Docker Resource Allocation**:
   ```bash
   # In docker-compose.yml, add resource limits:
   services:
     waha:
       deploy:
         resources:
           limits:
             cpus: '2.0'
             memory: 4G
   ```

2. **Run on Better Hardware**:
   - Recommended: 4+ CPU cores, 16GB RAM
   - Consider cloud deployment (AWS EC2, DigitalOcean)

3. **Session Strategy**:
   - Use multiple WhatsApp sessions
   - Distribute groups across sessions
   - Maximum 20-25 groups per session

## 🐳 Docker Commands

```bash
# View running containers
docker ps

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Restart services
docker-compose restart

# Update WAHA image
docker pull devlikeapro/waha-plus:latest
docker-compose up -d
```

## 📁 Project Structure

```
whatsapp-lead-agent/
├── docker-compose.yml      # Docker services configuration
├── Dockerfile             # WhatsApp Agent container definition
├── start.py              # Quick start script
├── main.py               # FastAPI application
├── waha_functions.py     # WAHA API integration
├── requirements.txt      # Python dependencies
├── database/            # Database models and migrations
├── warmer/              # Group warming engine
├── static/              # Web interface files
│   ├── index.html
│   ├── css/
│   └── js/
├── data/                # SQLite database (gitignored)
├── logs/                # Application logs (gitignored)
└── static/
    ├── uploads/         # Uploaded CSV files (gitignored)
    └── exports/         # Exported data (gitignored)
```

## 🔍 Troubleshooting

### Docker Issues

**"Cannot connect to Docker daemon"**
- Ensure Docker Desktop is running
- On Windows: Check if Docker is set to use WSL 2
- Try restarting Docker Desktop

**"Access denied" errors**
- Windows: Run as Administrator
- Linux: Ensure user is in docker group
- Mac: Check Docker Desktop permissions

### Application Issues

**"Failed to connect to WAHA"**
- Check if containers are running: `docker ps`
- Verify WAHA is accessible: `curl http://localhost:4500/api/version`
- Check logs: `docker-compose logs waha`

**High CPU Usage with Many Groups**
- Limit WAHA resources in docker-compose.yml
- Reduce number of groups per session
- Increase warming intervals
- Consider using multiple sessions

**QR Code Not Loading**
- Clear browser cache
- Check WebSocket connection in browser console
- Ensure port 8000 is not blocked by firewall

## 🚀 Deployment

### Cloud Deployment (Recommended for Production)

1. **Choose a Provider**:
   - AWS EC2 (t3.large or better)
   - DigitalOcean (4GB+ Droplet)
   - Google Cloud Compute
   - Azure VM

2. **Server Setup**:
   ```bash
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   
   # Clone repository
   git clone <your-repo>
   cd whatsapp-lead-agent
   
   # Start services
   docker-compose up -d
   ```

3. **Security**:
   - Use HTTPS (nginx reverse proxy)
   - Set strong WAHA_API_KEY
   - Implement authentication
   - Regular backups of data/ folder

## 🔒 Security Best Practices

1. **API Keys**: Always use API keys in production
2. **Network**: Use VPN or private networks
3. **Data**: Regular backups of SQLite database
4. **Updates**: Keep Docker images updated
5. **Monitoring**: Set up logging and alerts

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This tool is for legitimate business use only. Users are responsible for complying with WhatsApp's Terms of Service and local regulations regarding automated messaging.

## 🆘 Support

- Check the [Issues](https://github.com/yourusername/whatsapp-lead-agent/issues) section
- Review Docker and WAHA logs
- Ensure you're using the latest version

---

**Built with ❤️ for efficient WhatsApp lead management**