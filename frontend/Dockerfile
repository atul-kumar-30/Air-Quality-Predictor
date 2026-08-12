# ── Frontend Dockerfile ──────────────────────────────────────────
# Use an official Node.js LTS base image
FROM node:20-slim

# Set working directory inside the container
WORKDIR /app

# Copy package files first (for caching)
COPY package.json package-lock.json ./

# Install all npm dependencies
RUN npm install --silent

# Copy all frontend source files and Vite configs
COPY public/ ./public/
COPY src/ ./src/
COPY index.html vite.config.js eslint.config.js ./

# Expose port 3000 for the React dev server
EXPOSE 3000

# Tell React not to open a browser window automatically (since we're in Docker)
ENV BROWSER=none
# Tell React to allow connections from outside the container
ENV HOST=0.0.0.0

# Start the Vite development server
CMD ["npm", "run", "dev", "--", "--host"]
