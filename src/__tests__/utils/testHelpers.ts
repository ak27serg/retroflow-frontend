import { Session, Participant, Response, Group, Vote } from '@/lib/api';

export const createMockSession = (overrides?: Partial<Session>): Session => ({
  id: 'test-session-id',
  title: 'Test Session',
  inviteCode: 'TEST',
  phase: 'SETUP',
  settings: {},
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  participants: [],
  responses: [],
  groups: [],
  votes: [],
  connections: [],
  ...overrides,
});

export const createMockParticipant = (overrides?: Partial<Participant>): Participant => ({
  id: 'test-participant-id',
  sessionId: 'test-session-id',
  displayName: 'Test User',
  avatarId: '🦁',
  isHost: false,
  socketId: 'socket-123',
  isActive: true,
  lastActiveAt: '2024-01-01T00:00:00Z',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  responses: [],
  votes: [],
  ...overrides,
});

export const createMockResponse = (overrides?: Partial<Response>): Response => ({
  id: 'test-response-id',
  sessionId: 'test-session-id',
  participantId: 'test-participant-id',
  content: 'Test response content',
  category: 'WENT_WELL',
  positionX: 100,
  positionY: 100,
  groupId: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  participant: createMockParticipant(),
  ...overrides,
});

export const createMockGroup = (overrides?: Partial<Group>): Group => ({
  id: 'test-group-id',
  sessionId: 'test-session-id',
  label: 'Test Group',
  color: '#10b981',
  positionX: 200,
  positionY: 200,
  voteCount: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  responses: [],
  ...overrides,
});

export const createMockVote = (overrides?: Partial<Vote>): Vote => ({
  id: 'test-vote-id',
  sessionId: 'test-session-id',
  participantId: 'test-participant-id',
  groupId: 'test-group-id',
  voteCount: 1,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  participant: createMockParticipant(),
  group: createMockGroup(),
  ...overrides,
});

export const createMultiUserSession = (): Session => {
  const participants = [
    createMockParticipant({
      id: 'host-id',
      displayName: 'Host User',
      isHost: true,
      avatarId: '🦁',
    }),
    createMockParticipant({
      id: 'user-1',
      displayName: 'User One',
      isHost: false,
      avatarId: '🐯',
    }),
    createMockParticipant({
      id: 'user-2',
      displayName: 'User Two',
      isHost: false,
      avatarId: '🦊',
    }),
    createMockParticipant({
      id: 'user-3',
      displayName: 'User Three',
      isHost: false,
      avatarId: '🐺',
    }),
  ];

  const responses = [
    createMockResponse({
      id: 'response-1',
      participantId: 'host-id',
      content: 'Great teamwork this sprint',
      category: 'WENT_WELL',
      positionX: 100,
      positionY: 100,
    }),
    createMockResponse({
      id: 'response-2',
      participantId: 'user-1',
      content: 'Communication could improve',
      category: 'DIDNT_GO_WELL',
      positionX: 300,
      positionY: 150,
    }),
    createMockResponse({
      id: 'response-3',
      participantId: 'user-2',
      content: 'Good code reviews',
      category: 'WENT_WELL',
      positionX: 150,
      positionY: 200,
    }),
    createMockResponse({
      id: 'response-4',
      participantId: 'user-3',
      content: 'Too many meetings',
      category: 'DIDNT_GO_WELL',
      positionX: 350,
      positionY: 250,
    }),
  ];

  const groups = [
    createMockGroup({
      id: 'group-1',
      label: 'Team Collaboration',
      color: '#10b981',
      positionX: 100,
      positionY: 100,
      voteCount: 5,
      responses: [responses[0], responses[2]], // WENT_WELL responses
    }),
    createMockGroup({
      id: 'group-2',
      label: 'Process Issues',
      color: '#ef4444',
      positionX: 300,
      positionY: 150,
      voteCount: 3,
      responses: [responses[1], responses[3]], // DIDNT_GO_WELL responses
    }),
  ];

  const votes = [
    createMockVote({
      id: 'vote-1',
      participantId: 'host-id',
      groupId: 'group-1',
      voteCount: 2,
    }),
    createMockVote({
      id: 'vote-2',
      participantId: 'user-1',
      groupId: 'group-1',
      voteCount: 3,
    }),
    createMockVote({
      id: 'vote-3',
      participantId: 'user-2',
      groupId: 'group-2',
      voteCount: 3,
    }),
  ];

  return createMockSession({
    phase: 'VOTING',
    participants,
    responses,
    groups,
    votes,
  });
};

export const mockSocketService = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  getSocket: jest.fn().mockReturnValue({
    connected: true,
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  }),
};

export const mockApiService = {
  createSession: jest.fn(),
  joinSession: jest.fn(),
  getSession: jest.fn(),
  getParticipant: jest.fn(),
  updateParticipant: jest.fn(),
  deleteParticipant: jest.fn(),
};

export const renderWithProviders = (ui: React.ReactElement, options?: any) => {
  // In a real app, you might wrap with providers like Context, Router, etc.
  return ui;
};

export const simulateMultipleUsers = (actions: (() => void)[], delay = 100) => {
  return Promise.all(
    actions.map((action, index) => 
      new Promise<void>(resolve => {
        setTimeout(() => {
          action();
          resolve();
        }, index * delay);
      })
    )
  );
};

export const waitForElement = (querySelector: string, timeout = 3000): Promise<Element> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      const element = document.querySelector(querySelector);
      if (element) {
        resolve(element);
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        reject(new Error(`Element ${querySelector} not found within ${timeout}ms`));
        return;
      }
      
      setTimeout(check, 100);
    };
    
    check();
  });
};