package com.ai.chatbot_backend.kafka.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaConfig {

    @Bean
    public NewTopic chatTopic() {
        return TopicBuilder.name("chat-messages")
                .partitions(3)
                .replicas(1)
                .build();
    }

    @Bean
    public NewTopic authTopic() {
        return TopicBuilder.name("auth-events")
                .partitions(1)
                .replicas(1)
                .build();
    }
}