# Use Node.js base image
FROM node:20-bookworm

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Install Playwright browsers with dependencies
RUN npx playwright install --with-deps chromium

# Copy application files
COPY . .

# Create non-root user for security
RUN useradd -m -u 1001 playwright && \
    chown -R playwright:playwright /app

# Switch to non-root user
USER playwright

# Expose port
EXPOSE 6623

# Start the application
CMD ["npm", "start"]