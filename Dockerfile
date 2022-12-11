FROM node:16

WORKDIR /usr/app

COPY . .

RUN npm install -g gulp
RUN npm install

RUN npm run build

RUN mkdir -p /.npm && chown -R :root /.npm && chmod -R g=u /.npm
RUN chown -R :root /usr/app && chmod -R g=u /usr/app

EXPOSE 8080

CMD ["npm", "run", "start-public"]
