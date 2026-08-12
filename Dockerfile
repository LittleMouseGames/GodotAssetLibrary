FROM node:18-alpine

WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]

# argon2 0.27 has no Linux ARM64 musl prebuild, so node-gyp must compile it.
RUN apk add --no-cache python3 make g++ \
	&& npm ci

COPY . .
RUN npm run build

# Express enables its compiled view cache in production. Set this only after
# the build so npm ci still installs TypeScript/Webpack dev dependencies.
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/bundle.js"]
