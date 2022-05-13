# central place to configure the production replayweb.page loading prefix
ARG RWP_BASE_URL=https://cdn.jsdelivr.net/npm/replaywebpage@1.5.8/

FROM node:16 as build
ARG RWP_BASE_URL

WORKDIR /app
COPY package.json .
COPY yarn.lock .
RUN yarn --frozen-lockfile

COPY lit-localize.json ./
COPY postcss.config.js ./
COPY tailwind.config.js ./
COPY tsconfig.json ./
COPY webpack.config.js ./
COPY webpack.prod.js ./
COPY src ./src/

ARG GIT_COMMIT_HASH
ENV GIT_COMMIT_HASH=${GIT_COMMIT_HASH}

ARG GIT_BRANCH_NAME
ENV GIT_BRANCH_NAME=${GIT_BRANCH_NAME}

RUN yarn build

FROM nginx

ARG RWP_BASE_URL
ENV RWP_BASE_URL=${RWP_BASE_URL}

COPY --from=build /app/dist /usr/share/nginx/html

COPY ./nginx.conf /etc/nginx/nginx.conf
COPY ./frontend.template /etc/nginx/templates/frontend.conf.template

RUN rm /etc/nginx/conf.d/*

RUN mkdir -p /etc/nginx/resolvers; echo "" > /etc/nginx/resolvers/resolvers.conf

