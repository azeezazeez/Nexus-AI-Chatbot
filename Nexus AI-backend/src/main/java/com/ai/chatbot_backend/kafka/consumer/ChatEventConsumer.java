package com.ai.chatbot_backend.kafka.consumer;

import com.ai.chatbot_backend.model.ChatEvent;
import com.ai.chatbot_backend.service.ChatHistoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatEventConsumer {

    private final ChatHistoryService chatHistoryService;

    @KafkaListener(topics = "chat-messages", groupId = "chatbot-group")
    public void consumeChatMessage(ChatEvent chatEvent) {  // Directly receive ChatEvent, not String
        try {
            log.info("📨 Received Kafka message: {}", chatEvent);

            log.info("Processing chat event - Type: {}, UserId: {}, SessionId: {}, Role: {}",
                    chatEvent.getEventType(),
                    chatEvent.getUserId(),
                    chatEvent.getSessionId(),
                    chatEvent.getRole());

            // Process based on event type
            if ("MESSAGE".equals(chatEvent.getEventType())) {
                if (chatEvent.getSessionId() != null && chatEvent.getRole() != null && chatEvent.getContent() != null) {
                    // Save the message to database
                    chatHistoryService.saveMessage(
                            chatEvent.getSessionId(),
                            chatEvent.getRole(),
                            chatEvent.getContent()
                    );
                    log.info("✅ Message saved to database - SessionId: {}, Role: {}",
                            chatEvent.getSessionId(), chatEvent.getRole());
                } else {
                    log.warn("⚠️ Invalid MESSAGE event - missing required fields: {}", chatEvent);
                }
            } else {
                log.info("Event type: {}", chatEvent.getEventType());
            }

        } catch (Exception e) {
            log.error("❌ Error processing Kafka message: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = "user-events", groupId = "chatbot-group")
    public void consumeUserEvent(ChatEvent chatEvent) {  // Directly receive ChatEvent
        try {
            log.info("👤 Received user event: {}", chatEvent);
            log.info("User event - Type: {}, UserId: {}", chatEvent.getEventType(), chatEvent.getUserId());

        } catch (Exception e) {
            log.error("❌ Error processing user event: {}", e.getMessage(), e);
        }
    }
}