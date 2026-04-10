# Getting Started: Setup Guide

This guide will walk you through setting up the BrightCurios Workflow Platform on your local machine.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18.x or higher (check with `node -v`)
- **npm**: Version 9.x or higher (check with `npm -v`)
- **PostgreSQL**: Version 14 or higher (check with `psql --version`)
- **Git**: To clone the repository

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd bright-curios-automation-workflow/bright-curios-workflow
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Configuration

1.  **Start PostgreSQL**: Ensure your PostgreSQL service is running.
2.  **Create Database**: Create a new database named `bright_curios_workflow`.
    ```bash
    createdb bright_curios_workflow
    ```
3.  **Environment Variables**: Create a `.env` file in the root directory and add your connection string:
    ```bash
    DATABASE_URL="postgresql://username:password@localhost:5432/bright_curios_workflow"
    ```
    *Replace `username` and `password` with your PostgreSQL credentials.*

### 4. Run Migrations and Seeding

Apply the database schema and populate it with essential initial data (like Agent Prompts and sample templates).

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### 5. Optional Integrations

To enable image search and AI features, add the following to your `.env`:

```bash
# Unsplash API (Get a key at https://unsplash.com/developers)
UNSPLASH_ACCESS_KEY="your_access_key"

# OpenAI API (For direct AI integration)
OPENAI_API_KEY="your_openai_key"
```

## Running the Application

### Development Mode

Start the Next.js development server with hot-reloading:

```bash
npm run dev
```
The application will be available at [http://localhost:3000](http://localhost:3000).

### Production Build

To test the production build locally:

```bash
npm run build
npm start
```

## Verifying the Setup

1.  Open [http://localhost:3000](http://localhost:3000) in your browser.
2.  You should see the **Dashboard** (it might be empty initially).
3.  Navigate to **Settings > Agents** to verify that the Agent Prompts were successfully seeded.
4.  Navigate to **Research** and try creating a new research entry.

---

## Troubleshooting

- **Prisma Client Issues**: If you see errors related to the database client, run `npx prisma generate`.
- **Database Connection**: Double-check your `DATABASE_URL` in `.env`. Ensure the database exists and the user has sufficient permissions.
- **Port Conflicts**: If port 3000 is in use, you can run the server on a different port: `PORT=3001 npm run dev`.
