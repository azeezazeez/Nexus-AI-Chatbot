package com.ai.chatbot_backend.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
public class KafkaProducerService {

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    private static final String TOPIC = "user-events";

    public void sendUserEvent(String eventType, String email) {
        String message = eventType + ":" + email + ":" + System.currentTimeMillis();
        kafkaTemplate.send(TOPIC, message);
        System.out.println("Kafka event sent: " + message);
    }
}