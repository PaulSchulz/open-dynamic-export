# syntax=docker/dockerfile:1
ARG BUILD_FROM
FROM $BUILD_FROM

# Build
<<<<<<< HEAD
#FROM node:22-alpine AS build
FROM node:22-alpine

ARG DEBUG=false

WORKDIR /app

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.npm to speed up subsequent builds.
# Leverage a bind mounts to package.json and package-lock.json to avoid having to copy them into
# into this layer.
#RUN --mount=type=bind,source=package.json,target=package.json \
#    --mount=type=bind,source=package-lock.json,target=package-lock.json \
#    --mount=type=cache,target=/root/.npm \

# Copy the rest of the source files into the image.
COPY . .

RUN node -v

=======
#FROM node:22-alpine

WORKDIR /app

COPY . .

>>>>>>> home-assistant-addon
RUN npm ci

RUN npm run build

<<<<<<< HEAD
# Production
#FROM node:22-alpine AS production
#
#ENV NODE_ENV=production
#
#WORKDIR /app

#COPY --from=build /app/dist ./dist

#COPY package.json .

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.npm to speed up subsequent builds.
# Leverage a bind mounts to package.json and package-lock.json to avoid having to copy them into
# into this layer.
#RUN --mount=type=bind,source=package.json,target=package.json \
#    --mount=type=bind,source=package-lock.json,target=package-lock.json \
#    --mount=type=cache,target=/root/.npm \
#    npm ci --omit=dev

=======
>>>>>>> home-assistant-addon
EXPOSE 3000

# Run the application.
CMD ["npm", "start"]
