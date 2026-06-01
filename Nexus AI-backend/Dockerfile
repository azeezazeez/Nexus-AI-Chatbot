# Stage 1: Build
FROM eclipse-temurin:17-jdk-alpine AS build
RUN apk add --no-cache maven
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src src
RUN mvn package -DskipTests

# Stage 2: Run
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Install Tesseract and English language data
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng

# 🔥 CRITICAL: Set environment variable so Tesseract finds its language files
ENV TESSDATA_PREFIX=/usr/share/tessdata

COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
