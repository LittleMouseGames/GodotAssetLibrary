FROM node:18-alpine

WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]

# argon2 0.27 has no Linux ARM64 musl prebuild, so node-gyp must compile it.
RUN apk add --no-cache python3 make g++ \
	&& npm ci

EXPOSE 8080
