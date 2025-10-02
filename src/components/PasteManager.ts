import { useEffect, useRef, FC } from 'react';
import { useStdin } from 'ink';

interface PasteManagerProps {
  onPasteStart?: () => void;
  onPasteComplete?: (content: string) => void;
}

const PasteManager: FC<PasteManagerProps> = ({ onPasteStart, onPasteComplete }) => {
  const pasteBuffer = useRef<string>('');
  const isPasting = useRef<boolean>(false);
  const { stdin } = useStdin();

  useEffect(() => {
    if (!stdin) return;

    const handleData = (data: Buffer): void => {
      const str: string = data.toString();

      // Detect paste start sequence
      if (str.includes('\x1b[200~')) {
        isPasting.current = true;
        pasteBuffer.current = '';
        onPasteStart?.();

        // Extract content after paste start marker
        const startIndex = str.indexOf('\x1b[200~') + 6;
        const remainingStr = str.slice(startIndex);

        // Check if paste ends in the same chunk
        if (remainingStr.includes('\x1b[201~')) {
          const endIndex = remainingStr.indexOf('\x1b[201~');
          pasteBuffer.current = remainingStr.slice(0, endIndex);
          isPasting.current = false;
          onPasteComplete?.(pasteBuffer.current);
          pasteBuffer.current = '';
        } else {
          pasteBuffer.current += remainingStr;
        }
        return;
      }

      // Detect paste end sequence
      if (str.includes('\x1b[201~')) {
        const endIndex = str.indexOf('\x1b[201~');
        pasteBuffer.current += str.slice(0, endIndex);
        isPasting.current = false;
        onPasteComplete?.(pasteBuffer.current);
        pasteBuffer.current = '';
        return;
      }

      // Accumulate paste data
      if (isPasting.current) {
        pasteBuffer.current += str;

        // Safety limit - prevent infinite buffer growth
        if (pasteBuffer.current.length > 50 * 1024 * 1024) {
          // 50MB limit
          console.error('Paste buffer exceeded 50MB limit');
          isPasting.current = false;
          onPasteComplete?.(pasteBuffer.current);
          pasteBuffer.current = '';
        }
      }
    };

    // Listen to raw stdin data for bracketed paste sequences
    stdin.on('data', handleData);

    return () => {
      stdin.removeListener('data', handleData);
    };
  }, [stdin, onPasteStart, onPasteComplete]);

  // Component doesn't render anything
  return null;
};

export default PasteManager;
