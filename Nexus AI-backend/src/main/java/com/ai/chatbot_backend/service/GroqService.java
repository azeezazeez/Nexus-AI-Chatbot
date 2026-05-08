package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.exception.AIServiceException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service
@Slf4j
public class GroqService {

    @Value("${groq.api.key}")
    private String apiKey;

    @Value("${groq.api.url}")
    private String apiUrl;

    @Value("${groq.model}")
    private String model;

    private final RestTemplate restTemplate;

    public GroqService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public String generateResponse(String userMessage, List<Map<String, String>> conversationHistory) {
        try {
            // Build messages array with history + new message
            List<Map<String, Object>> messages = new ArrayList<>();

            // Optional system prompt
            messages.add(Map.of("role", "system", "content",
                    "You are a helpful assistant. Use the conversation history to provide context-aware responses."));

            // Add previous messages
            for (Map<String, String> historyMsg : conversationHistory) {
                messages.add(Map.of(
                        "role", historyMsg.get("role"),
                        "content", historyMsg.get("content")
                ));
            }

            // Add current user message
            messages.add(Map.of("role", "user", "content", userMessage));

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", model);
            requestBody.put("messages", messages);
            requestBody.put("temperature", 0.7);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            String url = apiUrl + "/chat/completions";
            ResponseEntity<Map> response = restTemplate.postForEntity(url, entity, Map.class);

            if (response.getBody() != null && response.getBody().containsKey("choices")) {
                List<Map<String, Object>> choices = (List<Map<String, Object>>) response.getBody().get("choices");
                if (!choices.isEmpty()) {
                    Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
                    return (String) message.get("content");
                }
            }

            throw new AIServiceException("Invalid response from Groq API");

        } catch (Exception e) {
            log.error("Error calling Groq API: {}", e.getMessage());
            throw new AIServiceException("Failed to get response from AI: " + e.getMessage());
        }
    }
}