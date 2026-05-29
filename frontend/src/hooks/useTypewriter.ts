import { useEffect, useRef, useState } from 'react';

type Phase = 'typing' | 'pausing' | 'deleting' | 'switching';

interface UseTypewriterOptions {
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
}

function useTypewriter(texts: string[], options: UseTypewriterOptions = {}) {
  const { typingSpeed = 100, deletingSpeed = 50, pauseDuration = 2000 } = options;
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const phaseRef = useRef<Phase>('typing');
  const indexRef = useRef(0);
  const charIndexRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (texts.length === 0) return;
    const currentText = texts[indexRef.current];

    const tick = () => {
      switch (phaseRef.current) {
        case 'typing':
          if (charIndexRef.current < currentText.length) {
            charIndexRef.current++;
            setDisplayText(currentText.slice(0, charIndexRef.current));
            setIsTyping(true);
            timeoutRef.current = setTimeout(tick, typingSpeed);
          } else {
            phaseRef.current = 'pausing';
            setIsTyping(false);
            timeoutRef.current = setTimeout(tick, pauseDuration);
          }
          break;

        case 'pausing':
          phaseRef.current = 'deleting';
          timeoutRef.current = setTimeout(tick, 0);
          break;

        case 'deleting':
          if (charIndexRef.current > 0) {
            charIndexRef.current--;
            setDisplayText(currentText.slice(0, charIndexRef.current));
            setIsTyping(true);
            timeoutRef.current = setTimeout(tick, deletingSpeed);
          } else {
            phaseRef.current = 'switching';
            timeoutRef.current = setTimeout(tick, 0);
          }
          break;

        case 'switching':
          indexRef.current = (indexRef.current + 1) % texts.length;
          charIndexRef.current = 0;
          phaseRef.current = 'typing';
          timeoutRef.current = setTimeout(tick, typingSpeed);
          break;
      }
    };

    timeoutRef.current = setTimeout(tick, 300);
    return () => clearTimeout(timeoutRef.current);
  }, [texts, typingSpeed, deletingSpeed, pauseDuration]);

  return { displayText, isTyping };
}

export default useTypewriter;
