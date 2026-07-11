import { Audio } from 'expo-av';
import { useEffect, useRef } from 'react';

export function useBusAttendanceSound() {
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSound() {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/sounds/bus_present.wav')
        );
        if (isMounted) {
          soundRef.current = sound;
        } else {
          await sound.unloadAsync();
        }
      } catch (error) {
        console.error('Failed to load bus_present sound', error);
      }
    }

    void loadSound();

    return () => {
      isMounted = false;
      if (soundRef.current) {
        void soundRef.current.unloadAsync();
      }
    };
  }, []);

  const playPresent = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.setStatusAsync({ shouldPlay: true, positionMillis: 0 });
      }
    } catch (error) {
      console.warn('Failed to play bus_present sound', error);
    }
  };

  return { playPresent };
}
