FROM node:16-alpine

WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]

RUN npm ci --prod

COPY . .

EXPOSE 8080

CMD [ "npm", "run devel" ]
