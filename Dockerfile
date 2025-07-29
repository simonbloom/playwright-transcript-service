# Use Node.js base image
FROM node:20-bookworm

# Set working directory
WORKDIR /app

# Create non-root user first
RUN useradd -m -u 1001 playwright

# Copy package files
COPY package*.json ./

# Install dependencies as root
RUN npm install

# Copy application files
COPY . .

# Change ownership to playwright user
RUN chown -R playwright:playwright /app

# Switch to playwright user and install browsers
USER playwright
RUN npx playwright install --with-deps chromium

# Expose port
EXPOSE 6623

# Start the application
CMD ["npm", "start"]
