# syntax=docker/dockerfile:1.4
FROM --platform=$BUILDPLATFORM docker.io/library/node:18 as build_deps

WORKDIR /app
COPY yarn.lock package.json ./
# Uses a cache mount for the Yarn cache so that it's not included in subsequent steps
RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn --production --frozen-lockfile --ignore-optional --network-timeout 1000000

COPY --link lit-localize.json \
  postcss.config.js \
  tailwind.config.js \
  tsconfig.json \
  webpack.config.js \
  webpack.prod.js \
  .eslintrc.js \
  tsconfig.eslint.json \
  index.d.ts \
  ./

COPY --link src ./src/
COPY --link plugins ./plugins/

# Build variables used to show current app version
# in the UI. Note that this will invalidate all
# subsequent RUN steps.
ARG GIT_COMMIT_HASH
ARG GIT_BRANCH_NAME
ARG VERSION

ENV GIT_COMMIT_HASH=${GIT_COMMIT_HASH} \
  GIT_BRANCH_NAME=${GIT_BRANCH_NAME} \
  VERSION=${VERSION}

# Prevent Docker image including node_modules to save space
RUN yarn build && \
  rm -rf ./node_modules

FROM docker.io/library/nginx:1.23.2

COPY --link --from=build_deps /app/dist /usr/share/nginx/html

#COPY ./nginx.conf /etc/nginx/nginx.conf
COPY --link ./frontend.conf.template /etc/nginx/templates/
COPY --link ./minio.conf /etc/nginx/includes/

ADD --link ./00-browsertrix-nginx-init.sh ./docker-entrypoint.d/
