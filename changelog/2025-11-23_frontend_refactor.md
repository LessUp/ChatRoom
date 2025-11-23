# Frontend Refactoring & Optimization

## Date
2025-11-23

## Author
Cascade

## Changes

### Security
- **Critical XSS Fix**: Replaced `innerHTML` message rendering with `textContent` and DOM node creation to prevent script injection attacks.

### Architecture
- **Modular Refactoring**: Rewrote `web/app.js` from a monolithic IIFE into structured namespaces:
    - `State`: Manages global user and room state.
    - `API`: Handles Fetch requests with automatic token refreshing.
    - `ChatSocket`: Encapsulates WebSocket connection, heartbeat, and reconnection logic.
    - `UI`: Manages DOM manipulation and rendering.
    - `Actions`: Business logic binding UI events to API/Socket calls.

### UI/UX
- **Toast Notifications**: Replaced native `alert()` with a custom, non-blocking `Toast` notification system.
- **Connection Status**: Added a real-time visual indicator in the header for WebSocket connection states (Connecting, Connected, Disconnected).
- **Message Styling**: Improved chat bubble visuals, added better timestamp formatting, and added fade-in animations.
- **Scroll Behavior**: Optimized `loadMoreHistory` to preserve scroll position when fetching old messages.
- **Room List**: Improved room list styling with active states and hover effects.

### Files Modified
- `web/index.html`: Added Toast container, status indicator placeholders, and updated structural classes.
- `web/app.js`: Complete rewrite.
