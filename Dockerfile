# Multi-stage build to handle TypeScript compilation
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install ALL dependencies (including devDependencies for TypeScript compilation)
RUN npm ci --ignore-scripts

# Copy source code and build configuration
COPY src/ ./src/
COPY tsconfig.json ./
COPY .eslintrc.js ./

# Build the TypeScript code (now tsc is available)
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --ignore-scripts --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create data directory
RUN mkdir -p data

# Expose port (if needed for health checks)
EXPOSE 3000

# Set environment variable for MCP mode by default
ENV MCP_MODE=true

# Run the server
CMD ["npm", "run", "start:mcp"]