package com.ai.chatbot_backend.controller;

import com.ai.chatbot_backend.dto.ChatMessage;
import com.ai.chatbot_backend.dto.ChatRequest;
import com.ai.chatbot_backend.dto.ChatResponse;
import com.ai.chatbot_backend.dto.ChatSession;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.service.RedisEventService;
import com.ai.chatbot_backend.service.ChatHistoryService;
import com.ai.chatbot_backend.service.GroqService;
import com.ai.chatbot_backend.service.UserService;
import com.ai.chatbot_backend.service.FileProcessorService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
@Slf4j
public class ChatController {

    private final GroqService groqService;
    private final ChatHistoryService chatHistoryService;
    private final UserService userService;
    private final RedisEventService redisEventService;
    private final FileProcessorService fileProcessorService;  // NEW

    // ─── Helpers (unchanged) ──────────────────────────────────────────────
    private User getCurrentUser(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) return null;
        return userService.getUserById(userId);
    }

    private ChatSession convertToSessionDTO(ChatSession session) {
        ChatSession dto = new ChatSession();
        dto.setId(session.getId());
        dto.setSessionName(session.getSessionName());
        dto.setCreatedAt(session.getCreatedAt());
        dto.setUpdatedAt(session.getUpdatedAt());
        return dto;
    }

    private ChatMessage convertToMessageDTO(ChatMessage message) {
        ChatMessage dto = new ChatMessage();
        dto.setId(message.getId());
        dto.setRole(message.getRole());
        dto.setContent(message.getContent());
        dto.setTimestamp(message.getTimestamp());
        return dto;
    }

    private boolean isSessionNotFoundError(String message) {
        if (message == null) return false;
        String lower = message.toLowerCase();
        return lower.contains("session not found")
                || lower.contains("no such session")
                || lower.contains("could not find")
                || lower.contains("unable to find");
    }

    // ─── Status (unchanged) ───────────────────────────────────────────────
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "connected");
        response.put("message", "Chat backend is running");
        response.put("timestamp", LocalDateTime.now().toString());
        return ResponseEntity.ok(response);
    }

    // ─── JSON endpoint (text‑only, unchanged) ─────────────────────────────
    @PostMapping("/send")
    public ResponseEntity<?> sendMessage(
            @Valid @RequestBody ChatRequest request, HttpSession session) {
        try {
            User currentUser = getCurrentUser(session);
            boolean isAuthenticated = (currentUser != null);

            Long sessionId = request.getSessionId();
            List<Map<String, String>> conversationHistory = new ArrayList<>();

            if (isAuthenticated) {
                if (sessionId == null) {
                    ChatSession newSession = chatHistoryService
                            .createNewSession(currentUser, "New Chat");
                    sessionId = newSession.getId();
                    log.info("Created new session: {}", sessionId);
                } else {
                    boolean exists = chatHistoryService
                            .sessionExistsForUser(sessionId, currentUser);
                    if (!exists) {
                        log.warn("Stale session {} for user {} – creating new session",
                                sessionId, currentUser.getId());
                        ChatSession newSession = chatHistoryService
                                .createNewSession(currentUser, "New Chat");
                        sessionId = newSession.getId();
                    }
                }

                List<ChatMessage> previousMessages =
                        chatHistoryService.getSessionMessages(sessionId);
                int startIndex = Math.max(0, previousMessages.size() - 10);
                for (int i = startIndex; i < previousMessages.size(); i++) {
                    ChatMessage msg = previousMessages.get(i);
                    conversationHistory.add(Map.of(
                            "role", msg.getRole(),
                            "content", msg.getContent()
                    ));
                }

                chatHistoryService.saveMessage(sessionId, "user", request.getMessage());
                redisEventService.sendUserEvent(
                        "MESSAGE_SENT", currentUser.getId() + ":" + sessionId);
            }

            String aiResponse = groqService.generateResponse(
                    request.getMessage(), conversationHistory);

            if (isAuthenticated && sessionId != null) {
                chatHistoryService.saveMessage(sessionId, "assistant", aiResponse);
                redisEventService.sendUserEvent(
                        "AI_RESPONSE_SENT", currentUser.getId() + ":" + sessionId);
            }

            ChatResponse chatResponse = new ChatResponse();
            chatResponse.setResponse(aiResponse);
            if (isAuthenticated) chatResponse.setSessionId(sessionId);

            return ResponseEntity.ok(chatResponse);

        } catch (Exception e) {
            log.error("Chat error: {}", e.getMessage(), e);
            if (isSessionNotFoundError(e.getMessage())) {
                ChatResponse errorResponse = new ChatResponse();
                errorResponse.setError("Session not found: " + request.getSessionId());
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
            ChatResponse errorResponse = new ChatResponse();
            errorResponse.setError(e.getMessage() != null
                    ? e.getMessage()
                    : "An unexpected error occurred. Please try again.");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    // ─── NEW: Multipart endpoint for files ────────────────────────────────
    @PostMapping(value = "/send", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> sendMessageWithFiles(
            @RequestParam("message") String message,
            @RequestParam(value = "sessionId", required = false) Long sessionId,
            @RequestParam(value = "model", required = false) String model,
            @RequestPart("files") List<MultipartFile> files,
            HttpSession session) {

        try {
            User currentUser = getCurrentUser(session);
            boolean isAuthenticated = (currentUser != null);

            // Extract content from each file
            StringBuilder filesContent = new StringBuilder();
            for (MultipartFile file : files) {
                String extracted = fileProcessorService.extractContent(file);
                filesContent.append("\n\n[Attached file: ")
                        .append(file.getOriginalFilename())
                        .append("]\n")
                        .append(extracted);
            }

            // Combine user message with file contents
            String fullPrompt = message + filesContent.toString();
            List<Map<String, String>> conversationHistory = new ArrayList<>();

            if (isAuthenticated) {
                if (sessionId == null) {
                    ChatSession newSession = chatHistoryService
                            .createNewSession(currentUser, "New Chat");
                    sessionId = newSession.getId();
                    log.info("Created new session: {}", sessionId);
                } else {
                    boolean exists = chatHistoryService
                            .sessionExistsForUser(sessionId, currentUser);
                    if (!exists) {
                        log.warn("Stale session {} for user {} – creating new session",
                                sessionId, currentUser.getId());
                        ChatSession newSession = chatHistoryService
                                .createNewSession(currentUser, "New Chat");
                        sessionId = newSession.getId();
                    }
                }

                // Load previous conversation (optional, but helpful)
                List<ChatMessage> previousMessages =
                        chatHistoryService.getSessionMessages(sessionId);
                int startIndex = Math.max(0, previousMessages.size() - 10);
                for (int i = startIndex; i < previousMessages.size(); i++) {
                    ChatMessage msg = previousMessages.get(i);
                    conversationHistory.add(Map.of(
                            "role", msg.getRole(),
                            "content", msg.getContent()
                    ));
                }

                // Save user message (original, without file content) to history
                chatHistoryService.saveMessage(sessionId, "user", message);
                redisEventService.sendUserEvent(
                        "MESSAGE_SENT", currentUser.getId() + ":" + sessionId);
            }

            // Generate AI response using the full prompt (message + file contents)
            String aiResponse = groqService.generateResponse(fullPrompt, conversationHistory);

            if (isAuthenticated && sessionId != null) {
                chatHistoryService.saveMessage(sessionId, "assistant", aiResponse);
                redisEventService.sendUserEvent(
                        "AI_RESPONSE_SENT", currentUser.getId() + ":" + sessionId);
            }

            ChatResponse chatResponse = new ChatResponse();
            chatResponse.setResponse(aiResponse);
            if (isAuthenticated) chatResponse.setSessionId(sessionId);

            return ResponseEntity.ok(chatResponse);

        } catch (Exception e) {
            log.error("File upload chat error: {}", e.getMessage(), e);
            ChatResponse errorResponse = new ChatResponse();
            errorResponse.setError(e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
}
