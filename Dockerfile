# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies without running prepare script
RUN npm ci --ignore-scripts --only=production

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./
COPY .eslintrc.js ./

# Now build the TypeScript code
RUN npm run build

# Create data directory
RUN mkdir -p data

# Expose port (if needed for health checks)
EXPOSE 3000

# Set environment variable for MCP mode by default
ENV MCP_MODE=true

# Run the server
CMD ["npm", "run", "start:mcp"]