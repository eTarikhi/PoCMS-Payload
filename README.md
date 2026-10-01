# PoCMS - Portfolio Content Management System

[![Payload CMS](https://img.shields.io/badge/Payload%20CMS-3.0-blue)](https://payloadcms.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-84.4%25-blue)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/Database-Neon%20PostgreSQL-336791)](https://neon.tech)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000)](https://vercel.com)

A modern **Portfolio Content Management System** built with **Payload 3.0 Headless CMS**, featuring a powerful admin dashboard for managing portfolio projects, content, media, and user authentication.

## 🎯 Key Features

- **Payload 3.0 Headless CMS** - Flexible, database-agnostic content management
- **Neon Serverless PostgreSQL** - Scalable, serverless database with automatic scaling
- **Vercel Blob Storage** - Secure, global file storage for media assets
- **Vercel Deployment** - Seamless CI/CD with automatic deployments
- **Authentication** - Built-in user authentication and role-based access control
- **Rich Media Management** - Image optimization, focal points, and automatic resizing
- **REST & GraphQL APIs** - Flexible API options for frontend consumption
- **TypeScript** - Type-safe development with full TypeScript support
- **Docker Support** - Containerized development and production environments

## 📋 Tech Stack

| Layer | Technology |
|-------|-----------|
| **CMS Framework** | Payload CMS 3.0 |
| **Runtime** | Node.js |
| **Language** | TypeScript (84.4%) |
| **Database** | Neon PostgreSQL (Serverless) |
| **File Storage** | Vercel Blob |
| **Deployment** | Vercel |
| **Package Manager** | pnpm |
| **Containerization** | Docker |

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ (or use Docker)
- **pnpm** (or npm/yarn)
- **Git**
- **Environment variables** (see [Environment Setup](#-environment-setup))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/eTarikhi/PoCMS-Payload.git
   cd PoCMS-Payload
   ```

2. **Install dependencies** (production only)
   ```bash
   pnpm install --no-prod
   ```

3. **Approve builds**
   ```bash
   pnpm approve-builds
   ```

4. **Generate all configuration files**
   ```bash
   pnpm generate:all
   ```

5. **Setup environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration (see Environment Setup section)
   ```

### Database Setup

#### Option 1: Fresh Database (Recommended for new projects)
```bash
# Create and run migrations on a fresh database
npx payload migrate:fresh
```

#### Option 2: Create Custom Migrations
```bash
# Create a new migration file
npx payload migrate:create
```

6. **Start development server**
   ```bash
   pnpm dev
   ```

7. **Access the application**
   - Admin Panel: `http://localhost:3000/admin`
   - API: `http://localhost:3000/api`
   - Follow on-screen instructions to create your first admin user

## 🔧 Environment Setup

Create a `.env.local` file in your project root with the following variables:

```env
# Payload CMS
PAYLOAD_SECRET=your-super-secret-key-here

# Database (Neon PostgreSQL)
DATABASE_URI=postgresql://user:password@ep-your-db.neon.tech/dbname

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=your-vercel-blob-token

# Node Environment
NODE_ENV=development

# Application
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3000

# Optional: For production
PAYLOAD_PUBLIC_SERVER_URL=https://your-domain.com
```

### Get Your Credentials

**Neon PostgreSQL:**
1. Create account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string from Dashboard
4. Use it as `DATABASE_URI`

**Vercel Blob Storage:**
1. Go to your Vercel project settings
2. Navigate to Storage → Blob
3. Create a new storage
4. Copy the read-write token
5. Set it as `BLOB_READ_WRITE_TOKEN`

**Payload Secret:**
```bash
# Generate a secure key
openssl rand -base64 32
```

## 📦 Available Scripts

```bash
# Development
pnpm dev              # Start development server with hot reload

# Installation
pnpm install --no-prod  # Install production dependencies only
pnpm approve-builds     # Approve and prepare builds
pnpm generate:all      # Generate all configuration and types

# Database
npx payload migrate:create   # Create a new migration
npx payload migrate:fresh    # Run migrations on fresh database
npx payload migrate          # Run pending migrations

# Build & Production
pnpm build            # Build for production
pnpm start            # Start production server
```

## 🏗️ Project Structure

```
PoCMS-Payload/
├── src/
│   ├── collections/          # Payload collections (content types)
│   │   ├── Users.ts         # User authentication
│   │   ├── Media.ts         # Media/uploads collection
│   │   ├── Projects.ts      # Portfolio projects (example)
│   │   └── ...
│   ├── blocks/              # Reusable content blocks
│   ├── endpoints/           # Custom API endpoints
│   ├── payload.config.ts    # Payload CMS configuration
│   └── server.ts            # Express server setup
├── Dockerfile              # Production Docker image
├── docker-compose.yml      # Local development with Docker
├── vercel.json            # Vercel deployment config
├── .env.example           # Environment variables template
├── package.json           # Dependencies and scripts
└── README.md              # This file
```

## 🐳 Docker Setup

### Local Development with Docker

```bash
# Ensure .env.local has MongoDB/PostgreSQL connection string
# For PostgreSQL with Docker: postgresql://postgres:password@postgres:5432/payload

# Start services
docker-compose up

# In another terminal, setup database
npx payload migrate:fresh

# Access admin panel
open http://localhost:3000/admin
```

### Docker Compose Configuration

The included `docker-compose.yml` sets up:
- PostgreSQL database container
- Application server
- Automatic volume mounting for hot reload
- Network for service communication

## 🌐 Deployment

### Vercel Deployment

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Connect to Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - Select the PoCMS-Payload project

3. **Configure Environment Variables**
   - In Vercel Dashboard → Settings → Environment Variables, add:
     - `DATABASE_URI` - Your Neon connection string
     - `BLOB_READ_WRITE_TOKEN` - Your Vercel Blob token
     - `PAYLOAD_SECRET` - Your secret key
     - `PAYLOAD_PUBLIC_SERVER_URL` - Your production domain

4. **Deploy**
   - Vercel will automatically build and deploy on every push to main
   - Your site will be live at `your-app.vercel.app`

### Custom Domain

1. In Vercel Dashboard → Domains
2. Add your custom domain
3. Update DNS records as instructed

## 📚 Collections

### Users (Authentication)
- Admin user management
- Role-based access control (RBAC)
- Session management
- Password reset functionality

### Media (Uploads)
- Image upload and management
- Automatic image optimization
- Focal point selection
- Multiple image sizes support
- Vercel Blob storage integration

### Portfolio Projects (Example)
Add your custom collections for:
- Project descriptions
- Case studies
- Skills & technologies
- Contact information
- Any other portfolio content

## 🔐 Security

- **Environment Variables** - Sensitive data in `.env.local` (never commit)
- **HTTPS Only** - All Vercel deployments are HTTPS by default
- **Database Security** - Neon provides automatic backups and encryption
- **Blob Storage** - Vercel Blob includes built-in access controls
- **Authentication** - Payload's built-in authentication system
- **Rate Limiting** - Configure in Payload config

## 📖 API Documentation

### REST API

Access your content via REST endpoints:

```bash
# Get all projects
curl http://localhost:3000/api/projects

# Get single project
curl http://localhost:3000/api/projects/:id

# Get media
curl http://localhost:3000/api/media

# Authenticated requests (include your API key)
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/...
```

### GraphQL API

GraphQL endpoint available at `/graphql` when enabled in Payload config.

### Payload Documentation

For detailed API documentation, visit:
- [Payload CMS Docs](https://payloadcms.com/docs)
- [Collections Documentation](https://payloadcms.com/docs/configuration/collections)
- [Authentication Guide](https://payloadcms.com/docs/authentication/overview)
- [File Uploads Guide](https://payloadcms.com/docs/configuration/collections/fields/upload)

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Check DATABASE_URI format
# Should be: postgresql://user:password@host:port/dbname

# Verify connection
psql $DATABASE_URI -c "SELECT 1"
```

### Build Failures

```bash
# Clear build cache
rm -rf .payload
rm -rf dist

# Regenerate
pnpm generate:all
pnpm build
```

### Missing Environment Variables

```bash
# Ensure all required vars are set
echo $DATABASE_URI
echo $BLOB_READ_WRITE_TOKEN
echo $PAYLOAD_SECRET
```

### Vercel Blob Storage Issues

- Verify token is valid in Vercel Dashboard
- Check token has read/write permissions
- Ensure `BLOB_READ_WRITE_TOKEN` matches your project

## 📝 Development Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make changes and test locally**
   ```bash
   pnpm dev
   ```

3. **Create migrations if needed**
   ```bash
   npx payload migrate:create
   ```

4. **Commit and push**
   ```bash
   git add .
   git commit -m "Add your feature"
   git push origin feature/your-feature
   ```

5. **Create Pull Request on GitHub**

6. **Deploy to production**
   - After merge to main, Vercel auto-deploys

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Ensure your code follows the existing style
5. Submit a pull request

## 📄 License

[Add your license here]

## 🆘 Support & Community

- **Issues** - [GitHub Issues](https://github.com/eTarikhi/PoCMS-Payload/issues)
- **Discussions** - [GitHub Discussions](https://github.com/eTarikhi/PoCMS-Payload/discussions)
- **Payload Community** - [Discord](https://discord.com/invite/payload)
- **Payload Docs** - [payloadcms.com/docs](https://payloadcms.com/docs)

## 📚 Related Documentation

- [Payload CMS 3.0](https://payloadcms.com/docs)
- [Neon PostgreSQL](https://neon.tech/docs)
- [Vercel Blob Storage](https://vercel.com/docs/storage/vercel-blob)
- [Vercel Deployment](https://vercel.com/docs)
- [Docker Documentation](https://docs.docker.com)

---

**Built with ❤️ using Payload CMS 3.0**
