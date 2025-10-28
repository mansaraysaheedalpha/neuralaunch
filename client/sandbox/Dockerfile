# Use a lightweight, secure Node.js 20 image
FROM node:20-alpine

# Install Python, make, and g++ needed for node-gyp (node-pty dependency)
# Also install git, as the agent might need it
RUN apk add --no-cache python3 make g++ git

# Set the working directory inside the container
WORKDIR /app

# Install dependencies (node-pty will now build successfully)
# Add 'pusher' for the log streaming
RUN npm install express node-pty pusher

# Copy our sandbox's internal API server code into the container
COPY sandbox-server.js .

# Expose the internal port for our API server
EXPOSE 8080

# The command to start our API server when the container boots
CMD ["node", "sandbox-server.js"]