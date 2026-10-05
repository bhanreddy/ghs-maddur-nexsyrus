import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useRef, useEffect } from "react";
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';

import { View, Text, StyleSheet, TouchableOpacity, FlatList, Keyboard } from 'react-native';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, Feather, MaterialIcons, FontAwesome5 } from "@expo/vector-icons";
import Animated, { FadeInUp, FadeOut, Layout } from "react-native-reanimated";

import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { AIService } from '../../src/services/aiService';
import LogoLoader from '../../src/components/LogoLoader';

// --- Types ---
type Message = {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: number;
};

// --- Components ---

// 1. Message Bubble Component 
const MessageBubble = React.memo(function MessageBubble({ item }: { item: Message; }) {
  const isUser = item.sender === 'user';

  return (
    <Animated.View
      entering={FadeInUp.duration(300).springify()}
      style={[
        styles.messageBubbleWrapper,
        isUser ? styles.userBubbleWrapper : styles.aiBubbleWrapper]
      }>

      {/* Avatar for AI */}
      {!isUser &&
        <View style={styles.aiAvatar}>
          <MaterialIcons name="smart-toy" size={16} color="#FFF" />
        </View>
      }
      <View style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.aiBubble]
      }>
        <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.aiMessageText]}>
          {item.text}
        </Text>
        <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.aiTimestamp]}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </Animated.View>);

});

// 2. Typing Indicator
const TypingIndicator = () =>
  <Animated.View
    entering={FadeInUp.duration(200)}
    exiting={FadeOut.duration(200)}
    style={styles.typingContainer}>

    <View style={styles.aiAvatar}>
      <MaterialIcons name="smart-toy" size={16} color="#FFF" />
    </View>
    <View style={styles.typingBubble}>
      <LogoLoader size={30} color="#4F46E5" />
      <Text style={styles.typingText}>Thinking...</Text>
    </View>
  </Animated.View>;

// --- Main Screen ---

export default function AIChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, loading]);

  const handleNewChat = () => {
    alertCompat(
      "Start New Chat?",
      "This will clear your current conversation.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "New Chat",
          style: "destructive",
          onPress: () => {
            setMessages([]);
            setInput("");
            Keyboard.dismiss();
          }
        }]

    );
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      text: userText,
      sender: "user",
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Keep keyboard simple interaction

      const response = await AIService.askDoubt({
        question: userText
      });

      const aiReply: Message = {
        id: response.id || Date.now().toString() + "_ai",
        text: response.answer,
        sender: "ai",
        timestamp: Date.now()
      };

      setMessages((prev) => [...prev, aiReply]);
    } catch (error: any) {

      // Determine the error message based on the error type
      let errorText = "⚠️ Checking connection... I couldn't reach the server. Please try again.";

      if (error.statusCode === 429 || error.message?.includes('Rate Limited')) {
        errorText = `⏳ ${error.message || "Whoa, too many questions! The AI is taking a breather."}`;
      } else if (error.statusCode === 503 || error.message?.includes('Model Unavailable')) {
        errorText = "🔧 The AI service is temporarily unavailable. Our team is working on it!";
      } else if (error.statusCode === 502 || error.message?.includes('Request Failed')) {
        errorText = "⚠️ The AI had trouble processing that. Please try rephrasing your question.";
      }

      const errorReply: Message = {
        id: Date.now().toString() + "_error",
        text: errorText,
        sender: "ai",
        timestamp: Date.now()
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setLoading(false);
    }
  };

  const renderEmptyState = () =>
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <MaterialIcons name="auto-awesome" size={48} color="#4F46E5" />
      </View>
      <Text style={styles.emptyTitle}>Hi, Student! 👋</Text>
      <Text style={styles.emptySubtitle}>I&apos;m your AI study assistant. Ask me anything about your subjects.</Text>
      <View style={styles.suggestionContainer}>
        <TouchableOpacity style={styles.suggestionChip} onPress={() => setInput("Explain Newton's laws")}>
          <Text style={styles.suggestionText}>🍎 Explain Newton&apos;s laws</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.suggestionChip} onPress={() => setInput("Solve a quadratic equation")}>
          <Text style={styles.suggestionText}>➗ Solve quadratic equation</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.suggestionChip} onPress={() => setInput("Summarize history chapter 1")}>
          <Text style={styles.suggestionText}>📜 Summarize History Ch 1</Text>
        </TouchableOpacity>
      </View>
    </View>;

  return (
    <ScreenLayout>
      <TourTarget id="screen.screen-ai-chat.overview"><StudentHeader showBackButton={true} title="AI Assistant" /></TourTarget>
      <KeyboardAwareScreen
        variant="fixed"
        style={styles.container}
        stickyContent={
          <View style={styles.inputWrapper}>
            <TourTarget id="screen.screen-ai-chat.workspace" native><View style={[styles.inputContainer, ds.searchBarWrapper]}>
              <AppTextInput
                placeholder="Ask a doubt..."
                style={[ds.inputInChrome, styles.input]}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={500} />

              <TouchableOpacity
                onPress={sendMessage}
                disabled={!input.trim() || loading}
                style={[
                  styles.sendButton,
                  (!input.trim() || loading) && styles.sendButtonDisabled]
                }>

                <Ionicons name="arrow-up" size={24} color="#FFF" />
              </TouchableOpacity>
            </View></TourTarget>
            <Text style={styles.disclaimer}>AI can make mistakes. Check important info.</Text>
          </View>
        }
      >
        {/* TOOLBAR */}
        <View style={styles.toolbar}>
          <View style={styles.modelBadge}>
            <FontAwesome5 name="robot" size={14} color="#4F46E5" />
            <Text style={styles.modelText}>NexSyrus AI</Text>
          </View>
          <TouchableOpacity onPress={handleNewChat} style={styles.newChatButton}>
            <Feather name="refresh-cw" size={16} color="#555" />
            <Text style={styles.newChatButtonText}>New Chat</Text>
          </TouchableOpacity>
        </View>
        {/* MESSAGES */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble item={item} />}
          style={styles.messagesList}
          contentContainerStyle={styles.chatListContent}
          ListEmptyComponent={renderEmptyState}
          ListFooterComponent={loading ? <TypingIndicator /> : <View style={{ height: 20 }} />}
          keyboardShouldPersistTaps="handled" />
      </KeyboardAwareScreen>
    </ScreenLayout>);

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  modelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6
  },
  modelText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600'
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  newChatButtonText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500'
  },
  messagesList: {
    flex: 1
  },
  chatListContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    flexGrow: 1
  },

  // Bubbles
  messageBubbleWrapper: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8
  },
  userBubbleWrapper: {
    justifyContent: 'flex-end'
  },
  aiBubbleWrapper: {
    justifyContent: 'flex-start'
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center'
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 20,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  userBubble: {
    backgroundColor: '#4F46E5', // Indigo 600
    borderBottomRightRadius: 4
  },
  aiBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#EEE'
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22
  },
  userMessageText: {
    color: '#FFFFFF'
  },
  aiMessageText: {
    color: '#1F2937'
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end'
  },
  userTimestamp: {
    color: 'rgba(255,255,255,0.7)'
  },
  aiTimestamp: {
    color: '#9CA3AF'
  },

  // Typing
  typingContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  typingBubble: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#EEE'
  },
  typingText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic'
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingBottom: 40
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 40
  },
  suggestionContainer: {
    width: '100%',
    paddingHorizontal: 20,
    gap: 12
  },
  suggestionChip: {
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '100%'
  },
  suggestionText: {
    fontSize: 15,
    color: '#374151'
  },

  // Input
  inputWrapper: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6'
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 10, // Centers text vertically in single line
    maxHeight: 100
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2 // Align with bottom of multiline input
  },
  sendButtonDisabled: {
    backgroundColor: '#C7C9D9'
  },
  disclaimer: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8
  }
});