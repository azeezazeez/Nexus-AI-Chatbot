package com.ai.chatbot_backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;

@Configuration
@PropertySource("classpath:application.properties")
public class AIConfig {

    @Value("${ai.ollama.url:http://localhost:11434}")
    private String ollamaUrl;

    @Value("${ai.ollama.model:llama3}")
    private String modelName;

    @Value("${ai.ollama.api.generate:/api/generate}")
    private String generateEndpoint;

    public String getFullGenerateUrl() {
        return ollamaUrl + generateEndpoint;
    }

    public String getModelName() {
        return modelName;
    }
}