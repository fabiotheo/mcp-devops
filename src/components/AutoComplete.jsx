import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Fuse from 'fuse.js';

const AutoComplete = ({
  input,
  suggestions = [],
  isActive = false,
  onSelect,
}) => {
  const [matches, setMatches] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Common Linux commands for default suggestions
  const defaultCommands = [
    'ls',
    'cd',
    'pwd',
    'mkdir',
    'rm',
    'cp',
    'mv',
    'cat',
    'echo',
    'grep',
    'find',
    'chmod',
    'chown',
    'ps',
    'kill',
    'top',
    'df',
    'du',
    'tar',
    'zip',
    'unzip',
    'wget',
    'curl',
    'ssh',
    'scp',
    'git',
    'docker',
    'npm',
    'node',
    'python',
    'pip',
    'vim',
    'nano',
  ];

  const allSuggestions = [...new Set([...suggestions, ...defaultCommands])];

  // Handle keyboard navigation when autocomplete is active
  useInput(
    (input, key) => {
      if (!isActive || matches.length === 0) return;

      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      }

      if (key.downArrow) {
        setSelectedIndex(prev => Math.min(matches.length - 1, prev + 1));
      }

      if (key.tab || key.return) {
        if (matches[selectedIndex] && onSelect) {
          onSelect(matches[selectedIndex]);
        }
      }
    },
    { isActive },
  );

  useEffect(() => {
    if (!isActive) {
      setMatches([]);
      return;
    }

    // Debounce the search to avoid excessive computation
    const handler = setTimeout(() => {
      if (!input || input.length < 1) {
        setMatches([]);
        return;
      }

      // Use Fuse.js for fuzzy matching
      const fuse = new Fuse(allSuggestions, {
        threshold: 0.4,
        includeScore: true,
        shouldSort: true,
      });

      const results = fuse.search(input);
      const topMatches = results.slice(0, 5).map(r => r.item);

      setMatches(topMatches);
      setSelectedIndex(0);
    }, 100); // 100ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [input, isActive, suggestions]);

  if (!isActive || matches.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>Suggestions (Tab to complete):</Text>
      {matches.map((match, index) => (
        <Box key={match}>
          <Text color={index === selectedIndex ? 'cyan' : 'gray'}>
            {index === selectedIndex ? '→ ' : '  '}
            {match}
          </Text>
        </Box>
      ))}
    </Box>
  );
};

export default AutoComplete;
