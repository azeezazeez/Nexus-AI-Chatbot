version: '3.8'

services:

  # ── Infrastructure ──────────────────────────────────────────
  zookeeper:
    image: confluentinc/cp-zookeeper:7.4.0
    container_name: zookeeper
    ports:
      - "2181:2181"
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    healthcheck:
      test: ["CMD", "nc", "-z", "localhost", "2181"]
      interval: 10s
      timeout: 5s
      retries: 5

  kafka:
    image: confluentinc/cp-kafka:7.4.0
    container_name: kafka
    depends_on:
      zookeeper:
        condition: service_healthy
    ports:
      - "29092:29092"   # host access (e.g. Kafka UI, local tools)
      # port 9092 is internal only — NOT published to the host
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181

      # ── The fix ────────────────────────────────────────────
      # Two named listeners:
      #   INTERNAL → used by other containers  (kafka:9092)
      #   EXTERNAL → used by the host machine  (localhost:29092)
      KAFKA_LISTENERS: INTERNAL://0.0.0.0:9092,EXTERNAL://0.0.0.0:29092
      KAFKA_ADVERTISED_LISTENERS: INTERNAL://kafka:9092,EXTERNAL://localhost:29092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: INTERNAL:PLAINTEXT,EXTERNAL:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: INTERNAL
      # ────────────────────────────────────────────────────────

      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
    healthcheck:
      test: ["CMD", "kafka-broker-api-versions", "--bootstrap-server", "localhost:9092"]
      interval: 15s
      timeout: 10s
      retries: 5

  # ── Application ─────────────────────────────────────────────
  chatbot:
    build:
      context: .          # Dockerfile lives in the project root
      dockerfile: Dockerfile
    container_name: chatbot
    depends_on:
      kafka:
        condition: service_healthy
    ports:
      - "8080:8080"
    environment:
      # Groq API key — pass via .env or export before running
      GROQ_API_KEY: ${GROQ_API_KEY}

      # Spring Boot picks this up via application.properties / @Value
      # Use the INTERNAL listener — stays inside the Docker network
      SPRING_KAFKA_BOOTSTRAP_SERVERS: kafka:9092

      # Optional JVM tuning for containers
      JAVA_OPTS: "-XX:MaxRAMPercentage=75"
    env_file:
      - .env             # create locally; never commit to git
    restart: unless-stopped