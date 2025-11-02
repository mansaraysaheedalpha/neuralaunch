#Dockerfile
# Use a lightweight, secure Node.js 20 image
FROM node:20-alpine

# Install Python, make, and g++ needed for node-gyp (node-pty dependency)
# Also install git, as the agent might need it
RUN apk add --no-cache git

# --- Create Non-Root User ---
# Create a group and user named 'sandboxuser'
# -S creates a system user (no password, no home dir by default)
# -G adds the user to the specified group
RUN addgroup -S sandboxgroup && adduser -S sandboxuser -G sandboxgroup
# --------------------------- 

# Set the working directory inside the container
WORKDIR /app

# Install dependencies (node-pty will now build successfully)
# Add 'pusher' for the log streaming
RUN npm install express pusher

# Copy our sandbox's internal API server code into the container
# *** Change ownership of the copied file to the new user/group ***
COPY --chown=sandboxuser:sandboxgroup sandbox-server.js .

# --- Switch User ---
# Switch to the non-root user for subsequent commands
USER sandboxuser
# -------------------

# Expose the internal port for our API server
EXPOSE 8080

# The command to start our API server (now runs as 'sandboxuser')
CMD ["node", "sandbox-server.js"]