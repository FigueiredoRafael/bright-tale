# Database Setup Guide

This project uses PostgreSQL as its database. You have two options for setting up the database locally.

---

## Option 1: Docker Compose (Recommended) 🐳

**Advantages:**

- ✅ No manual PostgreSQL installation
- ✅ Consistent environment across all machines
- ✅ Easy to start/stop
- ✅ Isolated from other projects
- ✅ Data persists in Docker volume

### Prerequisites

- Docker installed ([Get Docker](https://docs.docker.com/get-docker/))
- Docker Compose (included with Docker Desktop)

### Setup Steps

1. **Start the database**:

   ```bash
   docker-compose up -d
   ```

   The `-d` flag runs it in detached mode (background).

2. **Verify it's running**:

   ```bash
   docker-compose ps
   ```

   You should see `bright-curios-db` with status "Up".

3. **Check the logs** (optional):

   ```bash
   docker-compose logs postgres
   ```

4. **Initialize the database with Prisma**:

   ```bash
   npx prisma db push
   ```

   This creates all tables based on your schema.

5. **Seed the database** (optional - if you have seed data):

   ```bash
   npx prisma db seed
   ```

6. **Open Prisma Studio** to view your data:
   ```bash
   npx prisma studio
   ```
   Opens at http://localhost:5555

### Daily Usage

**Start database**:

```bash
docker-compose up -d
```

**Stop database**:

```bash
docker-compose down
```

**Stop and remove all data** (fresh start):

```bash
docker-compose down -v
```

**View logs**:

```bash
docker-compose logs -f postgres
```

### Connection Details

- **Host**: localhost
- **Port**: 5432
- **Database**: bright_curios_workflow
- **User**: postgres
- **Password**: postgres

Your `.env` file should have:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bright_curios_workflow?schema=public"
```

---

## Option 2: Local PostgreSQL Installation

If you prefer to install PostgreSQL directly on your machine.

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### macOS (with Homebrew)

```bash
brew install postgresql@16
brew services start postgresql@16
```

### Windows

Download and install from: https://www.postgresql.org/download/windows/

### Setup Database

```bash
# Access PostgreSQL
sudo -u postgres psql

# Create database
CREATE DATABASE bright_curios_workflow;

# Create user (if needed)
CREATE USER postgres WITH PASSWORD 'postgres';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE bright_curios_workflow TO postgres;

# Exit
\q
```

### Update .env

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bright_curios_workflow?schema=public"
```

### Initialize with Prisma

```bash
npx prisma db push
```

---

## Option 3: Cloud Database (Production/Testing)

For deployment or if you don't want to run a local database.

### Supabase (Free tier available)

1. Go to https://supabase.com
2. Create a new project
3. Get connection string from Settings → Database
4. Update `.env`:
   ```env
   DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
   ```

### Neon (Free tier available)

1. Go to https://neon.tech
2. Create a new project
3. Copy connection string
4. Update `.env` with your connection string

### Railway (Free tier available)

1. Go to https://railway.app
2. Create PostgreSQL service
3. Copy DATABASE_URL from variables
4. Update `.env`

---

## Troubleshooting

### Docker: Port 5432 already in use

```bash
# Check what's using the port
sudo lsof -i :5432

# Stop existing PostgreSQL
sudo systemctl stop postgresql
# or on macOS:
brew services stop postgresql
```

### Docker: Container won't start

```bash
# View logs
docker-compose logs postgres

# Remove and recreate
docker-compose down -v
docker-compose up -d
```

### Prisma: Can't connect to database

```bash
# Test connection
psql $DATABASE_URL

# Verify .env file exists and has correct DATABASE_URL
cat .env | grep DATABASE_URL

# Restart Next.js dev server after .env changes
```

### Database reset (fresh start)

```bash
# With Docker
docker-compose down -v
docker-compose up -d
npx prisma db push

# Without Docker
dropdb bright_curios_workflow
createdb bright_curios_workflow
npx prisma db push
```

---

## Useful Commands

### Prisma Commands

```bash
# Push schema to database (for development)
npx prisma db push

# Generate Prisma Client (after schema changes)
npx prisma generate

# Open Prisma Studio (GUI for database)
npx prisma studio

# Create a migration (for production)
npx prisma migrate dev --name your_migration_name

# View migration status
npx prisma migrate status

# Reset database (⚠️ deletes all data)
npx prisma migrate reset
```

### Docker Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Execute SQL directly
docker-compose exec postgres psql -U postgres -d bright_curios_workflow

# Backup database
docker-compose exec postgres pg_dump -U postgres bright_curios_workflow > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres -d bright_curios_workflow < backup.sql
```

---

## Quick Start Checklist

- [ ] Install Docker Desktop
- [ ] Run `docker-compose up -d`
- [ ] Verify `.env` has correct `DATABASE_URL`
- [ ] Run `npx prisma db push`
- [ ] Run `npx prisma studio` to verify tables created
- [ ] Start Next.js: `npm run dev`
- [ ] Visit http://localhost:3000/research

**You're ready to test!** 🚀
