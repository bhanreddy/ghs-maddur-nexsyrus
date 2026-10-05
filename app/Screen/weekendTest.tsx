import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { useTheme } from '../../src/hooks/useTheme';

/* ===================== DATA MODEL (BACKEND READY) ===================== */

interface Option {
  id: string;
  text: string;
}
interface Question {
  id: string;
  question: string;
  options: Option[];
}

/* ===================== TEMP UI DATA ===================== */
/* 🔴 REMOVE THIS LATER – replace with backend hook */

const QUESTION_DATA: Question = {
  id: 'q1',
  question: 'What is the output of the following JavaScript code?',
  options: [{
    id: 'A',
    text: 'This is Option 1'
  }, {
    id: 'B',
    text: 'This is Option 2'
  }, {
    id: 'C',
    text: 'This is Option 3'
  }, {
    id: 'D',
    text: 'This is Option 4'
  }]
};

/* ===================== SCREEN ===================== */

const WeekendTestScreen = () => {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(), []);
  const [timeLeft, setTimeLeft] = useState(20);
  const [currentQuestion, setCurrentQuestion] = useState<Question>(QUESTION_DATA);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  /* ===================== TIMER ===================== */
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  /* ===================== UI ACTIONS ===================== */

  const onSelectOption = (optionId: string) => {
    setSelectedOption(optionId);
  };
  const onNext = () => {
    if (!selectedOption) return;

    // 🔗 BACKEND READY
    // submitAnswer({ questionId: currentQuestion.id, selectedOption })

    setSelectedOption(null);
    // loadNextQuestion()
  };
  const onSkip = () => {
    // 🔗 BACKEND READY
    // submitSkip({ questionId: currentQuestion.id })

    setSelectedOption(null);
    // loadNextQuestion()
  };
  return <ScreenLayout>

            {/* ===== HEADER ===== */}
            <TourTarget id="screen.screen-weekend-test.overview"><StudentHeader showBackButton={true} title="Weekend Tests" /></TourTarget>

            {/* ===== CONTENT ===== */}
            <TourTarget id="screen.screen-weekend-test.workspace" native><TourScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>

                {/* ===== TIMER ===== */}
                <View style={styles.timerBox}>
                    <Text style={styles.timerText}>
                        00:{String(timeLeft).padStart(2, '0')}
                    </Text>
                </View>

                {/* ===== QUESTION ===== */}
                <Text style={styles.label}>Question</Text>
                <Text style={styles.question}>
                    {currentQuestion.question}
                </Text>

                {/* ===== OPTIONS ===== */}
                <Text style={styles.label}>Options</Text>

                {currentQuestion.options.map(option => {
const selected = selectedOption === option.id;
        return <TouchableOpacity key={option.id} style={[styles.optionCard, selected && styles.optionSelected]} activeOpacity={0.85} onPress={() => onSelectOption(option.id)}>
                            <View style={styles.optionKeyBox}>
                                <Text style={styles.optionKey}>{option.id}</Text>
                            </View>
                            <Text style={styles.optionText}>{option.text}</Text>
                        </TouchableOpacity>;
      })}

                {/* ===== ACTION BUTTONS ===== */}
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
                        <Text style={styles.skipText}>Skip</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.nextBtn, !selectedOption && styles.disabled]} disabled={!selectedOption} onPress={onNext}>
                        <Text style={styles.nextText}>Next</Text>
                    </TouchableOpacity>
                </View>

            </TourScrollView></TourTarget>

        </ScreenLayout>;
};
export default WeekendTestScreen;

/* ===================== STYLES ===================== */

const getStyles = () => StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40
  },
  /* Timer */
  timerBox: {
    alignSelf: 'center',
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 22,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16
  },
  timerText: {
    fontSize: 16,
    fontWeight: '800'
  },
  /* Labels */
  label: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
    marginTop: 10
  },
  question: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 14
  },
  /* Options */
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd'
  },
  optionSelected: {
    backgroundColor: '#ecfdf5',
    borderColor: '#22c55e'
  },
  optionKeyBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  optionKey: {
    fontSize: 16,
    fontWeight: '800'
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1
  },
  /* Actions */
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22
  },
  skipBtn: {
    width: '45%',
    backgroundColor: '#fecaca',
    paddingVertical: 12,
    borderRadius: 18,
    alignItems: 'center'
  },
  skipText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7f1d1d'
  },
  nextBtn: {
    width: '45%',
    backgroundColor: '#bbf7d0',
    paddingVertical: 12,
    borderRadius: 18,
    alignItems: 'center'
  },
  nextText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#065f46'
  },
  disabled: {
    opacity: 0.5
  }
});