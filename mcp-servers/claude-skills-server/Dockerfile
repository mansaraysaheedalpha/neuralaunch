# Claude Skills MCP Server Dockerfile
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY . .

# Install dependencies
RUN npm install --omit=dev

# Copy application code
COPY . .

# Expose port
EXPOSE 3101

# Set environment
ENV NODE_ENV=production
ENV PORT=3101

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3101/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["npm", "start"]
