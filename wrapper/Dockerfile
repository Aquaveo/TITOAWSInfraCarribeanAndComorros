# Thin layer over AHWA's image
ARG BASE_IMAGE
FROM ${BASE_IMAGE}

COPY tito-task.sh tito_s3.py smoke_test.py /opt/tito-task/
RUN chmod 755 /opt/tito-task/tito-task.sh && mkdir -p /run/tito

ENTRYPOINT ["/opt/tito-task/tito-task.sh"]
