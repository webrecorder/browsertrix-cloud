FROM alpine:latest
RUN apk add --no-cache openssh-client
RUN adduser -h /home/wr-proxy -D wr-proxy --uid 201407\
    && mkdir /home/wr-proxy/.ssh/ \
    && chown wr-proxy:wr-proxy /home/wr-proxy/.ssh \
    && chmod u=rwX,go= /home/wr-proxy/.ssh

USER proxy
ENTRYPOINT ["ssh"]
