const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface CreateSessionRequest {
  title?: string;
  hostName?: string;
  hostAvatar?: string;
}

export interface JoinSessionRequest {
  inviteCode: string;
  displayName?: string;
  avatarId?: string;
}

export interface Session {
  id: string;
  inviteCode: string;
  hostId: string;
  title: string;
  currentPhase: 'SETUP' | 'INPUT' | 'GROUPING' | 'VOTING' | 'RESULTS';
  timerDuration: number;
  timerEndTime: string | null;
  createdAt: string;
  updatedAt: string;
  settings: Record<string, unknown>;
  participants: Participant[];
  responses?: Response[];
  groups?: Group[];
  votes?: Vote[];
  connections?: Connection[];
}

export interface Participant {
  id: string;
  sessionId: string;
  displayName: string;
  avatarId: string;
  isHost: boolean;
  joinedAt: string;
  lastActive: string;
  socketId: string | null;
  isOnline?: boolean;
}

export interface Response {
  id: string;
  sessionId: string;
  participantId: string;
  category: 'WENT_WELL' | 'DIDNT_GO_WELL';
  content: string;
  groupId: string | null;
  positionX: number;
  positionY: number;
  createdAt: string;
  updatedAt: string;
  participant?: {
    displayName: string;
    avatarId: string;
  };
}

export interface Group {
  id: string;
  sessionId: string;
  label: string | null;
  color: string;
  positionX: number;
  positionY: number;
  voteCount: number;
  createdAt: string;
  responses: Response[];
}

export interface Vote {
  id: string;
  sessionId: string;
  participantId: string;
  groupId: string;
  voteCount: number;
  createdAt: string;
}

export interface Connection {
  id: string;
  sessionId: string;
  fromResponseId: string;
  toResponseId: string;
  createdAt: string;
}

class ApiService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    try {
      console.log('API Request:', url, config);
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  async createSession(data: CreateSessionRequest): Promise<{ session: Session; inviteUrl: string }> {
    return this.request<{ session: Session; inviteUrl: string }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async joinSession(data: JoinSessionRequest): Promise<{ session: Partial<Session>; participant: Participant }> {
    return this.request<{ session: Partial<Session>; participant: Participant }>('/api/sessions/join', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSession(sessionId: string): Promise<Session> {
    return this.request<Session>(`/api/sessions/${sessionId}`);
  }

  async getSessionByInviteCode(inviteCode: string): Promise<Partial<Session> & { participantCount: number }> {
    return this.request<Partial<Session> & { participantCount: number }>(`/api/sessions/invite/${inviteCode}`);
  }

  async updateSessionPhase(sessionId: string, phase: Session['currentPhase'], timerDuration?: number): Promise<Session> {
    return this.request<Session>(`/api/sessions/${sessionId}/phase`, {
      method: 'PATCH',
      body: JSON.stringify({ phase, timerDuration }),
    });
  }

  async getParticipant(participantId: string): Promise<Participant> {
    return this.request<Participant>(`/api/participants/${participantId}`);
  }

  async updateParticipant(participantId: string, data: Partial<Pick<Participant, 'displayName' | 'avatarId'>>): Promise<Participant> {
    return this.request<Participant>(`/api/participants/${participantId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getParticipantVotes(participantId: string): Promise<{ votes: Vote[]; totalVotes: number; remainingVotes: number }> {
    return this.request<{ votes: Vote[]; totalVotes: number; remainingVotes: number }>(`/api/participants/${participantId}/votes`);
  }

  async healthCheck(): Promise<{ status: string; timestamp: string; version: string }> {
    return this.request<{ status: string; timestamp: string; version: string }>('/health');
  }
}

export const apiService = new ApiService();