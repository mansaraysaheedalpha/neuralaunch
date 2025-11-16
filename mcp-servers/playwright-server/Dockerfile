# Playwright-Ready Base Image
FROM mcr.microsoft.com/playwright:v1.56.1-jammy
# Set working directory
WORKDIR /app

# Copy package files
COPY . .


# Install dependencies (production)
RUN npm install --omit=dev


# Copy application code
COPY . .

# Expose port
EXPOSE 3100

# Set environment
ENV NODE_ENV=production
ENV PORT=3100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3100/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["npm", "start"]
