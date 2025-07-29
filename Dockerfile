# Use Node.js base image
FROM node:20-bookworm

# Set working directory
WORKDIR /app

# Install Playwright system dependencies as root
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libxcb1 \
    libxss1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1001 playwright

# Copy package files
COPY package*.json ./

# Install dependencies as root
RUN npm install

# Copy application files
COPY . .

# Change ownership to playwright user
RUN chown -R playwright:playwright /app

# Switch to playwright user and install browsers (without system deps)
USER playwright
RUN npx playwright install chromium

# Expose port
EXPOSE 6623

# Start the application
CMD ["npm", "start"]
