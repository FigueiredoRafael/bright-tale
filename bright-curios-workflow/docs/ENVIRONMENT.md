# Environment Variables

This document describes all environment variables required for the BrightCurios Workflow platform.

## Required Variables

### Database Configuration

#### `DATABASE_URL`

**Required**: Yes  
**Type**: PostgreSQL connection string  
**Description**: Connection string for PostgreSQL database

**Format**:

```
postgresql://[user]:[password]@[host]:[port]/[database]
```

**Example**:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bright_curios_workflow"
```

**Notes**:

- Used by Prisma ORM for database connections
- Must include username, password, host, port, and database name
- For local development, default PostgreSQL port is 5432
- For production, use secure credentials and SSL connection

---

### Unsplash API

#### `UNSPLASH_ACCESS_KEY`

**Required**: Yes (for image search functionality)  
**Type**: String  
**Description**: Unsplash API access key for image search

**Example**:

```bash
UNSPLASH_ACCESS_KEY="your_unsplash_access_key_here"
```

**How to obtain**:

1. Go to [https://unsplash.com/developers](https://unsplash.com/developers)
2. Create a new application
3. Copy the "Access Key" from your application dashboard

**Notes**:

- Free tier: 50 requests per hour
- Used by `/api/assets/unsplash/search` endpoint
- Without this key, image search will return 500 error

---

### Encryption

#### `ENCRYPTION_SECRET`

**Required**: Yes (for WordPress and AI provider integrations)  
**Type**: String (64-character hex)  
**Description**: Secret key used to encrypt sensitive data at rest (API keys, passwords, credentials)

**Format**: 64-character hexadecimal string (256-bit / 32 bytes)

**Example**:

```bash
ENCRYPTION_SECRET="a3f8e1b2c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1"
```

**How to generate**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or using the built-in helper:

```bash
npm run generate:secret
```

**Notes**:

- Uses AES-256-GCM encryption with random IV
- Encrypts:
  - WordPress passwords (stored in `WordPressConfig` table)
  - AI provider API keys (stored in `AIProviderConfig` table)
  - Any other sensitive credentials added in the future
- Data is encrypted before storing in database
- Data is decrypted only when making API calls
- If changed, existing encrypted values become unreadable
- **Never commit the actual secret to version control**
- Without this variable, WordPress and AI provider settings will fail to save

---

## Optional Variables

### Node Environment

#### `NODE_ENV`

**Required**: No  
**Type**: String  
**Default**: `development`  
**Valid Values**: `development`, `production`, `test`

**Example**:

```bash
NODE_ENV="production"
```

**Notes**:

- Affects Prisma client caching behavior
- In production, Prisma client is not recreated on hot reload
- Affects logging levels and error verbosity

---

### Next.js Configuration

#### `PORT`

**Required**: No  
**Type**: Number  
**Default**: `3000`  
**Description**: Port number for Next.js server

**Example**:

```bash
PORT=3000
```

---

## Future Variables (Not Yet Implemented)

### AI Integration

These will be needed for Step 5 (AI Integration):

#### `AI_PROVIDER`

**Type**: String  
**Default**: `mock`  
**Valid Values**: `mock`, `openai`, `anthropic`  
**Description**: Select the AI adapter used by `/api/ai/*` endpoints. In development and CI default to `mock` for deterministic behavior.

**Example**:

```bash
AI_PROVIDER="mock"
```

#### `OPENAI_API_KEY`

**Type**: String  
**Description**: OpenAI API key for GPT-4 integration

**Example**:

```bash
OPENAI_API_KEY="sk-..."
```

#### `ANTHROPIC_API_KEY`

**Type**: String  
**Description**: Anthropic API key for Claude integration

**Example**:

```bash
ANTHROPIC_API_KEY="sk-ant-..."
```

### Idempotency & Bulk Creation

These variables support idempotent bulk-create workflows and token lifecycle control:

#### `IDEMPOTENCY_TOKEN_TTL_SECONDS`

**Type**: Number  
**Default**: `3600`  
**Description**: How long idempotency tokens are valid (in seconds). Tokens older than this should be considered expired and may be cleaned up.

**Example**:

```bash
IDEMPOTENCY_TOKEN_TTL_SECONDS="3600"
```

#### `MAX_BULK_CREATE`

**Type**: Number  
**Default**: `50`  
**Description**: Optional server-side safety cap for number of items allowed in a single bulk-create request. Controlled by `ENABLE_BULK_LIMITS` feature flag.

**Example**:

```bash
MAX_BULK_CREATE="50"
```

#### `ENABLE_BULK_LIMITS`

**Type**: Boolean  
**Default**: `false`  
**Description**: Feature flag to enable server enforcement of `MAX_BULK_CREATE`. Set to `true` to enable limit checks on bulk-create endpoints.

**Example**:

```bash
ENABLE_BULK_LIMITS="false"
```

---

## Environment File Setup

### Development (.env)

Create a `.env` file in the project root:

```bash
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bright_curios_workflow"

# Unsplash API
UNSPLASH_ACCESS_KEY="your_unsplash_access_key"

# Node Environment
NODE_ENV="development"
```

### Production (.env.production)

For production, use secure credentials:

```bash
# Database (use secure credentials and SSL)
DATABASE_URL="postgresql://user:secure_password@production-host:5432/database?sslmode=require"

# Unsplash API
UNSPLASH_ACCESS_KEY="your_production_unsplash_key"

# Node Environment
NODE_ENV="production"
```

---

## Security Best Practices

### DO:

- ✅ Keep `.env` files in `.gitignore`
- ✅ Use different credentials for development and production
- ✅ Rotate API keys regularly
- ✅ Use environment-specific `.env` files
- ✅ Enable SSL for production database connections
- ✅ Use read-only credentials where possible

### DON'T:

- ❌ Commit `.env` files to version control
- ❌ Share API keys in public repositories
- ❌ Use production credentials in development
- ❌ Hard-code credentials in source code
- ❌ Use weak database passwords

---

## Validation

The application will validate environment variables on startup. Missing required variables will cause the application to fail with helpful error messages.

**Example validation error**:

```
Error: UNSPLASH_ACCESS_KEY environment variable is required
Please set it in your .env file or environment
```

---

## Deployment Platforms

### Vercel

Set environment variables in Vercel Dashboard:

1. Go to Project Settings > Environment Variables
2. Add each variable with appropriate scope (Production/Preview/Development)
3. Redeploy after adding variables

### Docker

Pass environment variables via `-e` flag or `.env` file:

```bash
docker run -e DATABASE_URL="..." -e UNSPLASH_ACCESS_KEY="..." app
```

Or use `docker-compose.yml`:

```yaml
services:
  app:
    env_file:
      - .env.production
```

### Traditional Hosting

Export variables in your shell profile or use a process manager like PM2:

```bash
# .bashrc or .zshrc
export DATABASE_URL="..."
export UNSPLASH_ACCESS_KEY="..."
```

---

## Environment Variable Priority

Variables are loaded in this order (later overrides earlier):

1. System environment variables
2. `.env.local` (not in git, highest priority for local overrides)
3. `.env.production` or `.env.development` (environment-specific)
4. `.env` (shared defaults)

---

## Troubleshooting

### "Cannot connect to database"

- Check `DATABASE_URL` format
- Verify PostgreSQL is running
- Confirm credentials are correct
- Test connection manually: `psql $DATABASE_URL`

### "Unsplash API error"

- Verify `UNSPLASH_ACCESS_KEY` is set
- Check API key is valid in Unsplash dashboard
- Verify you haven't exceeded rate limits

### "Environment variable not found"

- Ensure `.env` file exists in project root
- Restart Next.js dev server after adding variables
- Check for typos in variable names
- Verify `.env` is not in `.gitignore` for your local copy
