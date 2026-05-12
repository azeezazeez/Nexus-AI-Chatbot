package com.ai.chatbot_backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AIConfig {

    @Value("${groq.api.url:https://api.groq.com/openai/v1}")
    private String groqApiUrl;

    @Value("${groq.api.key}")
    private String groqApiKey;

    @Value("${groq.model:meta-llama/llama-4-scout-17b-16e-instruct}")
    private String modelName;

    private static final String CHAT_ENDPOINT = "/chat/completions";

    public String getFullGenerateUrl() {
        return groqApiUrl + CHAT_ENDPOINT;
    }

    public String getModelName() {
        return modelName;
    }

    public String getGroqApiKey() {
        return groqApiKey;
    }

    public String getGroqApiUrl() {
        return groqApiUrl;
    }
}
