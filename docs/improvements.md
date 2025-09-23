# MCP Terminal Assistant - Interface Improvements Plan

## Overview
This document outlines a comprehensive plan to enhance the MCP Terminal Assistant interface to match or exceed the Claude Code CLI experience.

## Priority Classification

### CRITICAL - Must Have (Phase 1)
#### 1. Fixed Input at Bottom
- **Goal**: Input area always visible at bottom of terminal (Claude Code CLI parity)
- **Implementation**:
  ```javascript
  Box({ flexDirection: 'column', height: '100%' },
    Box({ flexGrow: 1, overflow: 'hidden' }, // History area
      // Scrollable content
    ),
    Box({ flexShrink: 0 }, // Fixed input area
      // Separators + Input + Footer
    )
  )
  ```
- **Benefits**:
  - Input always accessible
  - Natural scroll behavior
  - Better UX for long conversations

### HIGH PRIORITY - Visual Improvements (Phase 2)

#### 2. Timestamps
- **Format**: `[14:32]` - discrete, right-aligned
- **Implementation**: `new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})`
- **Placement**: Before each message, dimmed color

#### 3. Typing Indicator
- **Visual**: Animated "..." or spinner while AI is processing
- **State**: Add `isTyping` state variable
- **Placement**: Below last message or in input area

#### 4. Syntax Highlighting
- **Code blocks**: Language-specific highlighting
- **Commands**: Green for shell commands
- **Paths**: Blue for file paths
- **Errors**: Red for error messages
- **Implementation**: Use `chalk` or `ansi-colors` library

### MEDIUM PRIORITY - Functionality (Phase 3)

#### 5. Smart Clear Command
- **Behavior**: Clear visual history but maintain context
- **Implementation**:
  - Clear `history` array (visual)
  - Keep `fullHistory` array (context)
  - Add "[History cleared]" indicator

#### 6. Context Indicator
- **Display**: `[Context: 12 messages]` in header
- **Update**: Real-time as conversation grows
- **Visual**: Subtle, dimmed text

#### 7. Enhanced Paste Detection
- **Current**: Basic multi-line detection
- **Enhancement**:
  - Detect code vs plain text
  - Auto-format code blocks
  - Language detection

### LOW PRIORITY - Nice to Have (Phase 4)

#### 8. Performance Optimizations
- **Virtualization**: Render only visible messages
- **Lazy Loading**: Load history in chunks
- **Debouncing**: Optimize input re-renders
- **Implementation**:
  - Consider `react-window` for terminal
  - Implement viewport-based rendering

#### 9. Feedback Enhancements
- **Sound**: Optional beep on response
- **Terminal Title**: Update with status
- **Progress Bar**: For long operations
- **Implementation**: System-specific, optional features

#### 10. Advanced Features
- **Auto-scroll**: Smart scrolling (only if at bottom)
- **Search**: Ctrl+F to search history
- **Export**: Save conversation to file
- **Themes**: Dark/Light/Custom color schemes

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Implement fixed input at bottom
- [ ] Test scroll behavior
- [ ] Ensure compatibility with existing features

### Phase 2: Visual Polish (Week 2)
- [ ] Add timestamps to messages
- [ ] Implement typing indicator
- [ ] Add syntax highlighting
- [ ] Test visual consistency

### Phase 3: Enhanced Functionality (Week 3)
- [ ] Smart clear command
- [ ] Context indicator
- [ ] Improved paste handling
- [ ] User testing

### Phase 4: Performance & Polish (Week 4)
- [ ] Performance optimizations
- [ ] Optional features
- [ ] Documentation
- [ ] Release preparation

## Technical Specifications

### Layout Structure
```
┌─────────────────────────────────────┐
│ Header (Title + Version + Context)  │
├─────────────────────────────────────┤
│                                     │
│ History Area (flexGrow: 1)         │
│ - Scrollable                       │
│ - All messages                     │
│ - Timestamps                       │
│                                     │
├─────────────────────────────────────┤
│ Input Area (flexShrink: 0)         │
│ ─────────────────────────────────── │
│ > Type your question...█            │
│ ─────────────────────────────────── │
│ /help • ↑↓ history • Ctrl+C exit   │
└─────────────────────────────────────┘
```

### State Management
```javascript
const [input, setInput] = useState('');
const [history, setHistory] = useState([]);        // Visual history
const [fullHistory, setFullHistory] = useState([]); // Context history
const [isTyping, setIsTyping] = useState(false);
const [contextSize, setContextSize] = useState(0);
const [lastMessageTime, setLastMessageTime] = useState(null);
```

## Success Metrics

1. **User Experience**
   - Interface matches or exceeds Claude Code CLI
   - Smooth scrolling with 1000+ messages
   - Input always responsive, no lag

2. **Visual Consistency**
   - Clean, minimal design
   - Consistent color scheme
   - Clear visual hierarchy

3. **Performance**
   - < 50ms input latency
   - Smooth 60fps scrolling
   - Memory efficient with large histories

4. **Accessibility**
   - Works in all terminal sizes
   - Keyboard navigation complete
   - Screen reader compatible

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ink layout complexity | High | Start simple, iterate |
| Performance with large history | Medium | Implement virtualization early |
| Cross-platform compatibility | Medium | Test on Mac/Linux/Windows |
| Breaking existing features | High | Comprehensive testing suite |

## Testing Strategy

1. **Unit Tests**: Each new component
2. **Integration Tests**: Feature interactions
3. **Performance Tests**: Large history handling
4. **User Acceptance**: Real-world usage patterns

## Conclusion

This improvement plan transforms MCP Terminal Assistant into a world-class terminal UI, matching or exceeding the Claude Code CLI experience. The phased approach ensures rapid value delivery while building toward advanced features.

## Next Steps

1. Review and approve plan
2. Begin Phase 1 implementation
3. Set up testing framework
4. Create feedback loop with users

---

*Document created: 2025-09-22*
*Status: Planning Complete*
*Next Action: Begin Phase 1 - Fixed Input Implementation*