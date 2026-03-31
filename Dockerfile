FROM node:20-alpine

WORKDIR /app

# Enable pnpm via corepack or install globally
RUN npm install -g pnpm

# Copy package configurations
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy the rest of the source code
COPY . .

# Expose default wrangler dev port
EXPOSE 8787

# Command to run Node.js server
CMD ["pnpm", "run", "dev"]
