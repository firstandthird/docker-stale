FROM firstandthird/cronquest:0.4.0

USER root
RUN apk add --update bash coreutils docker && rm -rf /var/cache/apk/*

COPY cronquest.yaml /cronquest.yaml
COPY clean /clean

CMD ["/cronquest.yaml"]
