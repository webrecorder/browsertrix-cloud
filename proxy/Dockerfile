FROM alpine:latest
RUN apk add --no-cache openssh-client
RUN adduser -h /home/proxy -D proxy --uid 201407\
    && mkdir /home/proxy/.ssh/ \
    && chown proxy:proxy /home/proxy/.ssh \
    && chmod u=rwX,go= /home/proxy/.ssh

USER proxy
ENTRYPOINT ["ssh"]
