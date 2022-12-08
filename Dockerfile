FROM node:16

WORKDIR /usr/app

COPY . .

RUN npm install -g gulp
RUN npm install --production
RUN npm cache clean --force\

RUN npm run build

# Permissions
RUN chown -R :root /.npm && chmod -R g=u /.npm
RUN chown -R :root /usr/app/packages/engine/Build && chmod -R g=u /usr/app/packages/engine/Build
RUN chown -R :root /usr/app && RUN chmod -R g=u /usr/app

USER user

EXPOSE 8080

CMD ["npm", "run", "start-public"]
