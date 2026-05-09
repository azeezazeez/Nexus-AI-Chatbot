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
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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
    private final RedisEventService redisEventService; // ✅ Replaces ChatEventProducer

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

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "connected");
        response.put("message", "Chat backend is running");
        response.put("timestamp", LocalDateTime.now().toString());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/send")
    public ResponseEntity<?> sendMessage(@Valid @RequestBody ChatRequest request, HttpSession session) {
        try {
            User currentUser = getCurrentUser(session);
            boolean isAuthenticated = (currentUser != null);

            Long sessionId = request.getSessionId();

            if (isAuthenticated) {
                if (sessionId == null) {
                    ChatSession newSession = chatHistoryService.createNewSession(currentUser, "New Chat");
                    sessionId = newSession.getId();
                    log.info("Created new session: {}", sessionId);
                }

                // ✅ Save message directly to PostgreSQL
                chatHistoryService.saveMessage(sessionId, "user", request.getMessage());

                // ✅ Redis replaces Kafka
                redisEventService.sendUserEvent("MESSAGE_SENT", currentUser.getId() + ":" + sessionId);
            }

            List<Map<String, String>> conversationHistory = new ArrayList<>();
            if (isAuthenticated && sessionId != null) {
                List<ChatMessage> previousMessages = chatHistoryService.getSessionMessages(sessionId);
                int startIndex = Math.max(0, previousMessages.size() - 11);
                for (int i = startIndex; i < previousMessages.size() - 1; i++) {
                    ChatMessage msg = previousMessages.get(i);
                    conversationHistory.add(Map.of(
                            "role", msg.getRole(),
                            "content", msg.getContent()
                    ));
                }
            }

            String aiResponse = groqService.generateResponse(request.getMessage(), conversationHistory);

            if (isAuthenticated && sessionId != null) {
                // ✅ Save AI response directly to PostgreSQL
                chatHistoryService.saveMessage(sessionId, "assistant", aiResponse);

                // ✅ Redis replaces Kafka
                redisEventService.sendUserEvent("AI_RESPONSE_SENT", currentUser.getId() + ":" + sessionId);
            }

            ChatResponse response = new ChatResponse();
            response.setResponse(aiResponse);
            if (isAuthenticated) {
                response.setSessionId(sessionId);
            }

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Chat error: {}", e.getMessage(), e);
            ChatResponse errorResponse = new ChatResponse();
            errorResponse.setError(e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    @GetMapping("/sessions")
    public ResponseEntity<Map<String, Object>> getUserSessions(HttpSession session) {
        Map<String, Object> response = new HashMap<>();
        try {
            User currentUser = getCurrentUser(session);
            if (currentUser == null) {
                response.put("sessions", List.of());
                response.put("authenticated", false);
                return ResponseEntity.ok(response);
            }

            List<ChatSession> sessions = chatHistoryService.getUserSessions(currentUser);
            List<ChatSession> sessionDTOs = sessions.stream()
                    .map(this::convertToSessionDTO)
                    .collect(Collectors.toList());

            log.info("Loaded {} sessions for user: {}", sessionDTOs.size(), currentUser.getUsername());

            response.put("sessions", sessionDTOs);
            response.put("authenticated", true);
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error fetching sessions: {}", e.getMessage(), e);
            response.put("sessions", List.of());
            response.put("error", e.getMessage());
            return ResponseEntity.ok(response);
        }
    }

    @GetMapping("/history/{sessionId}")
    public ResponseEntity<Map<String, Object>> getSessionHistory(@PathVariable Long sessionId, HttpSession session) {
        Map<String, Object> response = new HashMap<>();
        try {
            User currentUser = getCurrentUser(session);
            if (currentUser == null) {
                response.put("messages", List.of());
                response.put("authenticated", false);
                return ResponseEntity.ok(response);
            }

            List<ChatMessage> messages = chatHistoryService.getSessionMessages(sessionId);
            List<ChatMessage> messageDTOs = messages.stream()
                    .map(this::convertToMessageDTO)
                    .collect(Collectors.toList());

            log.info("Loaded {} messages for session: {}", messageDTOs.size(), sessionId);

            response.put("messages", messageDTOs);
            response.put("sessionId", sessionId);
            response.put("authenticated", true);
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error fetching history: {}", e.getMessage(), e);
            response.put("messages", List.of());
            response.put("error", e.getMessage());
            return ResponseEntity.ok(response);
        }
    }

    @PostMapping("/new-session")
    public ResponseEntity<Map<String, Object>> createNewSession(HttpSession session) {
        Map<String, Object> response = new HashMap<>();
        try {
            User currentUser = getCurrentUser(session);
            if (currentUser == null) {
                response.put("error", "User not logged in");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(response);
            }

            ChatSession newSession = chatHistoryService.createNewSession(currentUser, "New Chat");

            // ✅ Redis replaces Kafka
            redisEventService.sendUserEvent("SESSION_CREATED", currentUser.getId() + ":" + newSession.getId());

            response.put("id", newSession.getId());
            response.put("sessionName", newSession.getSessionName());
            response.put("message", "New session created successfully");
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error creating session: {}", e.getMessage(), e);
            response.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }

    @PatchMapping("/rename")
    public ResponseEntity<Map<String, Object>> renameSession(@RequestBody Map<String, Object> request, HttpSession session) {
        Map<String, Object> response = new HashMap<>();
        try {
            User currentUser = getCurrentUser(session);
            if (currentUser == null) {
                response.put("error", "User not logged in");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(response);
            }

            Long sessionId = ((Number) request.get("sessionId")).longValue();
            String name = (String) request.get("name");

            if (name == null || name.trim().isEmpty()) {
                response.put("error", "Session name cannot be empty");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
            }

            ChatSession updatedSession = chatHistoryService.renameSession(sessionId, name);

            response.put("success", true);
            response.put("sessionId", updatedSession.getId());
            response.put("sessionName", updatedSession.getSessionName());
            response.put("message", "Session renamed successfully");
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error renaming session: {}", e.getMessage(), e);
            response.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }

    @PostMapping("/generate-title")
    public ResponseEntity<Map<String, Object>> generateTitle(@RequestBody Map<String, String> request, HttpSession session) {
        Map<String, Object> response = new HashMap<>();
        try {
            User currentUser = getCurrentUser(session);
            if (currentUser == null) {
                response.put("error", "User not logged in");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(response);
            }

            String firstMessage = request.get("firstMessage");
            if (firstMessage == null || firstMessage.trim().isEmpty()) {
                response.put("error", "Message cannot be empty");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
            }

            String prompt = String.format(
                    "Generate a very short, concise title (maximum 5-7 words) for a conversation that starts with: \"%s\". " +
                            "The title should capture the main topic or intent. " +
                            "Return ONLY the title, no quotes, no explanation, no punctuation at the end.",
                    firstMessage.length() > 100 ? firstMessage.substring(0, 100) : firstMessage
            );

            String title = groqService.generateResponse(prompt, List.of());
            title = title.replace("\"", "").replace("'", "").trim();
            if (title.length() > 60) {
                title = title.substring(0, 57) + "...";
            }

            log.info("Generated title: '{}'", title);

            response.put("title", title);
            response.put("success", true);
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error generating title: {}", e.getMessage(), e);
            String fallbackTitle = request.get("firstMessage").length() > 30
                    ? request.get("firstMessage").substring(0, 30) + "..."
                    : request.get("firstMessage");
            response.put("title", fallbackTitle);
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.ok(response);
        }
    }

    @DeleteMapping("/session/{sessionId}")
    public ResponseEntity<Map<String, Object>> deleteSession(@PathVariable Long sessionId, HttpSession session) {
        Map<String, Object> response = new HashMap<>();
        try {
            User currentUser = getCurrentUser(session);
            if (currentUser == null) {
                response.put("error", "User not logged in");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(response);
            }

            chatHistoryService.deleteSession(sessionId);

            // ✅ Redis replaces Kafka
            redisEventService.sendUserEvent("SESSION_DELETED", currentUser.getId() + ":" + sessionId);

            response.put("message", "Session deleted successfully");
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error deleting session: {}", e.getMessage(), e);
            response.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }

    @DeleteMapping("/sessions")
    public ResponseEntity<Map<String, Object>> clearAllSessions(HttpSession session) {
        Map<String, Object> response = new HashMap<>();
        try {
            User currentUser = getCurrentUser(session);
            if (currentUser == null) {
                response.put("error", "User not logged in");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(response);
            }

            chatHistoryService.clearUserSessions(currentUser);

            // ✅ Redis replaces Kafka
            redisEventService.sendUserEvent("ALL_SESSIONS_CLEARED", String.valueOf(currentUser.getId()));

            response.put("message", "All sessions cleared successfully");
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error clearing sessions: {}", e.getMessage(), e);
            response.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }
}
