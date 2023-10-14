# Use an official Node.js runtime as the base image
FROM node:18

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json files to the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Build the application using webpack and Sass
#RUN npm run build

# Expose the port your application listens on (if necessary)
# EXPOSE 8080

# Define the command to start your application
CMD [ "npm", "start" ]