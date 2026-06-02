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

    // ─── Text-only (unchanged) ────────────────────────────────────────────────

    public String generateResponse(String userMessage,
                                   List<Map<String, String>> conversationHistory) {
        List<Map<String, Object>> messages = buildHistory(conversationHistory);

        // Plain string content for text-only turns
        messages.add(Map.of("role", "user", "content", userMessage));

        return callGroq(messages);
    }

    // ─── Vision (new) ─────────────────────────────────────────────────────────

    /**
     * Sends one or more images together with a text prompt to the Groq
     * vision model.  Images must be passed as raw Base64-encoded bytes;
     * this method wraps them in the data-URL format Groq expects.
     *
     * @param userMessage       The text the user typed (may be empty for pure image queries)
     * @param conversationHistory Previous turns (text only – history doesn't carry images)
     * @param base64Images      Raw Base64 strings, one per image file
     * @param mimeTypes         MIME type matching each entry in base64Images
     *                          (e.g. "image/jpeg", "image/png", "image/webp")
     */
    public String generateResponseWithImages(String userMessage,
                                             List<Map<String, String>> conversationHistory,
                                             List<String> base64Images,
                                             List<String> mimeTypes) {

        List<Map<String, Object>> messages = buildHistory(conversationHistory);

        // content is a LIST of parts for multimodal messages
        List<Map<String, Object>> contentParts = new ArrayList<>();

        // 1. Add every image as an image_url part
        for (int i = 0; i < base64Images.size(); i++) {
            String dataUrl = "data:" + mimeTypes.get(i) + ";base64," + base64Images.get(i);
            contentParts.add(Map.of(
                    "type", "image_url",
                    "image_url", Map.of("url", dataUrl)
            ));
        }

        // 2. Add the text part last (model reads images first, then the question)
        String text = (userMessage == null || userMessage.isBlank())
                ? "Please describe what you see in this image."
                : userMessage;
        contentParts.add(Map.of("type", "text", "text", text));

        messages.add(Map.of("role", "user", "content", contentParts));

        return callGroq(messages);
    }

    // ─── Shared helpers ───────────────────────────────────────────────────────

    private List<Map<String, Object>> buildHistory(List<Map<String, String>> history) {
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of(
                "role", "system",
                "content", "You are a helpful assistant with vision capabilities. "
                         + "You can analyse images and files. "
                         + "Use the conversation history to provide context-aware responses."
        ));
        for (Map<String, String> h : history) {
            messages.add(Map.of(
                    "role", h.get("role"),
                    "content", h.get("content")
            ));
        }
        return messages;
    }

    private String callGroq(List<Map<String, Object>> messages) {
        try {
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", model);
            requestBody.put("messages", messages);
            requestBody.put("temperature", 0.7);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<Map> response =
                    restTemplate.postForEntity(apiUrl + "/chat/completions", entity, Map.class);

            if (response.getBody() != null && response.getBody().containsKey("choices")) {
                List<Map<String, Object>> choices =
                        (List<Map<String, Object>>) response.getBody().get("choices");
                if (!choices.isEmpty()) {
                    Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
                    return (String) message.get("content");
                }
            }
            throw new AIServiceException("Invalid response from Groq API");

        } catch (AIServiceException e) {
            throw e;
        } catch (Exception e) {
            log.error("Error calling Groq API: {}", e.getMessage());
            throw new AIServiceException("Failed to get response from AI: " + e.getMessage());
        }
    }
}
