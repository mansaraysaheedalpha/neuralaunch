# Use a lightweight, secure Node.js 20 image
FROM node:20-alpine

# Install git, as the agent might need it
RUN apk add --no-cache git

# --- Create Non-Root User ---
RUN addgroup -S sandboxgroup && adduser -S sandboxuser -G sandboxgroup

# Set the working directory inside the container
WORKDIR /app

# Install dependencies (only express and pusher)
RUN npm install express pusher

# Copy our sandbox's internal API server code into the container
COPY --chown=sandboxuser:sandboxgroup sandbox-server.js .

# --- Create workspace directory and set permissions ---
RUN mkdir -p /workspace && chown -R sandboxuser:sandboxgroup /workspace

# --- Switch User ---
USER sandboxuser

# Set working directory to workspace for git operations
WORKDIR /workspace

# Expose the internal port for our API server
EXPOSE 8080

# The command to start our API server
CMD ["node", "/app/sandbox-server.js"]