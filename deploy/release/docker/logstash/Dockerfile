FROM docker.elastic.co/logstash/logstash:9.4.2

# Driver PostgreSQL JDBC con version y SHA-256 fijados
ARG PG_DRIVER_VERSION=42.7.3
ARG PG_DRIVER_SHA256=a2644cbfba1baa145ff7e8c8ef582a6eed7a7ec4ca792f7f054122bdec756268

USER root
RUN mkdir -p /usr/share/logstash/vendor/jar/jdbc \
    && curl -fsSL \
         "https://repo1.maven.org/maven2/org/postgresql/postgresql/${PG_DRIVER_VERSION}/postgresql-${PG_DRIVER_VERSION}.jar" \
         -o /usr/share/logstash/vendor/jar/jdbc/postgresql-${PG_DRIVER_VERSION}.jar \
    && echo "${PG_DRIVER_SHA256}  /usr/share/logstash/vendor/jar/jdbc/postgresql-${PG_DRIVER_VERSION}.jar" \
         | sha256sum -c -
USER logstash
