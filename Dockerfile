# syntax=docker/dockerfile:1
ARG BUILD_FROM
FROM $BUILD_FROM

# Build
#FROM node:22-alpine

ARG DEBUG=false

WORKDIR /app

COPY . .

RUN npm ci

RUN npm run build

EXPOSE 3000

# Run the application.
CMD ["npm", "start"]
