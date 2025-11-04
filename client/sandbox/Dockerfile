# Use a lightweight, secure Node.js 20 image
FROM node:20-alpine

# Install git, as the agent might need it
RUN apk add --no-cache git

# Set the working directory inside the container
WORKDIR /app

# Install dependencies (only express and pusher)
RUN npm install express pusher

# Copy our sandbox's internal API server code into the container
COPY sandbox-server.js .

# Create workspace directory
RUN mkdir -p /workspace

# Set working directory to workspace for git operations
WORKDIR /workspace

# Expose the internal port for our API server
EXPOSE 8080

# The command to start our API server (running as root)
CMD ["node", "/app/sandbox-server.js"]