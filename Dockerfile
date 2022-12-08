FROM node:16

WORKDIR /usr/app

COPY . .

RUN npm install -g gulp
RUN npm install --production
RUN npm cache clean --force\

RUN npm run build

RUN mkdir -p /.npm
RUN chown -R :root /.npm
RUN chmod -R g=u /.npm

# RUN chmod -R g=u /usr/app
# RUN chown -R :root /usr/app
RUN chown -R :root /usr/app/packages/engine/Build
RUN chmod -R g=u /usr/app/packages/engine/Build

RUN chown -R :root /usr/app
RUN chmod -R g=u /usr/app

# RUN chgrp -R 0 /usr && \
#     chmod -R g=u /usr
# RUN useradd -ms /bin/bash user && usermod -a -G root user

USER user

EXPOSE 8080

CMD ["npm", "run", "start-public"]
