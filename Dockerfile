FROM node:16-alpine

WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]

RUN ping -c 2 google.ca

RUN npm ci --prod

COPY . .

EXPOSE 8080
