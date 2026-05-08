package com.ai.chatbot_backend.kafka.producer;

import com.ai.chatbot_backend.model.ChatEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatEventProducer {

    private final KafkaTemplate<String, ChatEvent> kafkaTemplate;  // Changed from String to ChatEvent

    @Value("${kafka.topic.chat-messages:chat-messages}")
    private String chatMessagesTopic;

    @Value("${kafka.topic.user-events:user-events}")
    private String userEventsTopic;

    public void sendChatMessage(ChatEvent event) {
        try {
            kafkaTemplate.send(chatMessagesTopic, event);
            log.info("✅ Sent chat message to Kafka - Topic: {}, Type: {}, UserId: {}",
                    chatMessagesTopic, event.getEventType(), event.getUserId());
        } catch (Exception e) {
            log.error("❌ Failed to send chat message to Kafka: {}", e.getMessage(), e);
        }
    }

    public void sendAuthEvent(ChatEvent event) {
        try {
            kafkaTemplate.send(userEventsTopic, event);
            log.info("✅ Sent auth event to Kafka - Topic: {}, Type: {}, UserId: {}",
                    userEventsTopic, event.getEventType(), event.getUserId());
        } catch (Exception e) {
            log.error("❌ Failed to send auth event to Kafka: {}", e.getMessage(), e);
        }
    }

    public void sendUserEvent(String eventType, String email) {
        try {
            ChatEvent event = new ChatEvent();
            event.setEventType(eventType);
            event.setTimestamp(java.time.LocalDateTime.now());
            // You can add email to the event if needed
            kafkaTemplate.send(userEventsTopic, event);
            log.info("✅ Sent user event to Kafka - Topic: {}, Type: {}, Email: {}",
                    userEventsTopic, eventType, email);
        } catch (Exception e) {
            log.error("❌ Failed to send user event to Kafka: {}", e.getMessage(), e);
        }
    }
}