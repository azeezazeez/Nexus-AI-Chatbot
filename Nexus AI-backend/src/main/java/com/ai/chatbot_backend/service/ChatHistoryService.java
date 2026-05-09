package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.ChatMessage;
import com.ai.chatbot_backend.dto.ChatSession;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.exception.AIServiceException;
import com.ai.chatbot_backend.repository.ChatMessageRepository;
import com.ai.chatbot_backend.repository.ChatSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatHistoryService {

    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;

    @Transactional
    public ChatSession createNewSession(User user, String sessionName) {
        ChatSession session = new ChatSession();
        session.setUserId(user.getId());
        session.setSessionName(sessionName);
        session.setCreatedAt(LocalDateTime.now());
        session.setUpdatedAt(LocalDateTime.now());
        return chatSessionRepository.save(session);
    }

    @Transactional
    public ChatSession renameSession(Long sessionId, String newName) {
        ChatSession session = chatSessionRepository.findById(sessionId)
                .orElseThrow(() -> new AIServiceException("Session not found with id: " + sessionId));

        session.setSessionName(newName);
        session.setUpdatedAt(LocalDateTime.now());

        return chatSessionRepository.save(session);
    }

    @Transactional
    public void saveMessage(Long sessionId, String role, String content) {
        ChatSession session = chatSessionRepository.findById(sessionId)
                .orElseThrow(() -> new AIServiceException("Session not found: " + sessionId));

        ChatMessage message = new ChatMessage();
        message.setSessionId(sessionId);
        message.setRole(role);
        message.setContent(content);
        message.setTimestamp(LocalDateTime.now());

        chatMessageRepository.save(message);

        session.setUpdatedAt(LocalDateTime.now());
        chatSessionRepository.save(session);
    }

    public List<ChatMessage> getSessionMessages(Long sessionId) {
        return chatMessageRepository.findBySessionIdOrderByTimestampAsc(sessionId);
    }

    public List<ChatSession> getUserSessions(User user) {
        // FIXED: Pass Long userId instead of User object
        return chatSessionRepository.findByUserIdOrderByUpdatedAtDesc(user.getId());
    }

    @Transactional
    public void deleteSession(Long sessionId) {
        if (!chatSessionRepository.existsById(sessionId)) {
            log.warn("Session not found with id: {}", sessionId);
            return;
        }
        chatMessageRepository.deleteBySessionId(sessionId);
        chatSessionRepository.deleteById(sessionId);
        log.info("Deleted session: {}", sessionId);
    }

    @Transactional
    public void clearUserSessions(User user) {
        List<ChatSession> sessions = chatSessionRepository.findByUserIdOrderByUpdatedAtDesc(user.getId());
        for (ChatSession session : sessions) {
            chatMessageRepository.deleteBySessionId(session.getId());
        }
        chatSessionRepository.deleteByUserId(user.getId());
        log.info("Cleared all sessions for user: {}", user.getUsername());
    }
}