import { describe, it, expect, beforeEach } from 'vitest';
import { loadAuth, saveTokens, saveUser, setLastRoomId, clearAuth } from './storage';
import type { User } from './types';

describe('storage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('loadAuth', () => {
        it('should return empty values when nothing is stored', () => {
            const auth = loadAuth();
            expect(auth.accessToken).toBe('');
            expect(auth.refreshToken).toBe('');
            expect(auth.user).toBeNull();
            expect(auth.lastRoomId).toBeNull();
        });

        it('should return stored tokens', () => {
            localStorage.setItem('chat_access', 'test-access');
            localStorage.setItem('chat_refresh', 'test-refresh');

            const auth = loadAuth();
            expect(auth.accessToken).toBe('test-access');
            expect(auth.refreshToken).toBe('test-refresh');
        });

        it('should return stored user', () => {
            const user: User = { id: 1, username: 'testuser' };
            localStorage.setItem('chat_user', JSON.stringify(user));

            const auth = loadAuth();
            expect(auth.user).toEqual(user);
        });

        it('should handle invalid user JSON', () => {
            localStorage.setItem('chat_user', 'invalid-json');

            const auth = loadAuth();
            expect(auth.user).toBeNull();
        });

        it('should return stored lastRoomId', () => {
            localStorage.setItem('chat_last_room', '42');

            const auth = loadAuth();
            expect(auth.lastRoomId).toBe(42);
        });

        it('should return null for invalid lastRoomId', () => {
            localStorage.setItem('chat_last_room', 'invalid');

            const auth = loadAuth();
            expect(auth.lastRoomId).toBeNull();
        });
    });

    describe('saveTokens', () => {
        it('should store both tokens', () => {
            saveTokens('access-123', 'refresh-456');

            expect(localStorage.getItem('chat_access')).toBe('access-123');
            expect(localStorage.getItem('chat_refresh')).toBe('refresh-456');
        });

        it('should overwrite existing tokens', () => {
            saveTokens('old-access', 'old-refresh');
            saveTokens('new-access', 'new-refresh');

            expect(localStorage.getItem('chat_access')).toBe('new-access');
            expect(localStorage.getItem('chat_refresh')).toBe('new-refresh');
        });
    });

    describe('saveUser', () => {
        it('should store user as JSON', () => {
            const user: User = { id: 1, username: 'alice' };
            saveUser(user);

            const stored = localStorage.getItem('chat_user');
            expect(stored).toBe(JSON.stringify(user));
        });

        it('should remove user when null', () => {
            const user: User = { id: 1, username: 'alice' };
            saveUser(user);
            saveUser(null);

            expect(localStorage.getItem('chat_user')).toBeNull();
        });
    });

    describe('setLastRoomId', () => {
        it('should store room id', () => {
            setLastRoomId(42);
            expect(localStorage.getItem('chat_last_room')).toBe('42');
        });

        it('should remove room id when null', () => {
            setLastRoomId(42);
            setLastRoomId(null);
            expect(localStorage.getItem('chat_last_room')).toBeNull();
        });

        it('should remove room id when zero or negative', () => {
            setLastRoomId(42);
            setLastRoomId(0);
            expect(localStorage.getItem('chat_last_room')).toBeNull();
        });
    });

    describe('clearAuth', () => {
        it('should remove all auth data', () => {
            saveTokens('access', 'refresh');
            saveUser({ id: 1, username: 'test' });
            setLastRoomId(42);

            clearAuth();

            const auth = loadAuth();
            expect(auth.accessToken).toBe('');
            expect(auth.refreshToken).toBe('');
            expect(auth.user).toBeNull();
            expect(auth.lastRoomId).toBeNull();
        });
    });
});
