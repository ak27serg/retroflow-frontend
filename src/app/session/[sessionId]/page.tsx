'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiService, Session, Participant } from '@/lib/api';
import { socketService } from '@/lib/socket';
import SetupPhase from '@/components/phases/SetupPhase';
import InputPhase from '@/components/phases/InputPhase';
import GroupingPhase from '@/components/phases/GroupingPhase';
import VotingPhase from '@/components/phases/VotingPhase';
import ResultsPhase from '@/components/phases/ResultsPhase';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const initSession = async () => {
      try {
        // Get session info from localStorage
        const sessionData = localStorage.getItem('retroflow-session');
        if (!sessionData) {
          router.push('/');
          return;
        }

        const { sessionId: storedSessionId, participantId } = JSON.parse(sessionData);
        
        if (storedSessionId !== sessionId) {
          router.push('/');
          return;
        }

        // Fetch current session state
        const sessionResponse = await apiService.getSession(sessionId);
        setSession(sessionResponse);

        // Find current participant
        console.log('Debug participant lookup:', {
          participantId,
          participants: sessionResponse.participants,
          sessionData: JSON.parse(sessionData)
        });

        const participant = sessionResponse.participants.find(p => p.id === participantId);
        if (!participant) {
          console.error('Participant not found!', { participantId, participants: sessionResponse.participants });
          router.push('/');
          return;
        }
        setCurrentParticipant(participant);

        // Connect to WebSocket
        const socket = socketService.connect();
        
        socket.on('connect', () => {
          setIsConnected(true);
          // Join the session room
          socket.emit('join_session', {
            sessionId,
            participantId: participant.id
          });
        });

        socket.on('disconnect', () => {
          setIsConnected(false);
        });

        socket.on('session_joined', (data) => {
          console.log('Joined session:', data);
          setSession({
            ...data.session,
            participants: data.participants
          });
        });

        socket.on('phase_changed', async (data) => {
          if (!data || !data.phase) {
            console.error('Invalid phase_changed data:', data);
            return;
          }

          setSession(prev => prev ? { 
            ...prev, 
            currentPhase: data.phase, 
            timerEndTime: data.timerEndTime || null 
          } : null);
          
          // Refresh session data when entering grouping, voting, or results phase to ensure we have all data
          if (data.phase === 'GROUPING' || data.phase === 'VOTING' || data.phase === 'RESULTS') {
            try {
              const freshSession = await apiService.getSession(sessionId);
              setSession(freshSession);
            } catch (error) {
              console.error('Failed to refresh session data:', error);
            }
          }
        });

        socket.on('participant_joined', (participant) => {
          setSession(prev => {
            if (!prev) return null;
            
            const existingParticipants = prev.participants || [];
            const participantExists = existingParticipants.some(p => p.id === participant.id);
            
            if (participantExists) {
              // Update existing participant
              return {
                ...prev,
                participants: existingParticipants.map(p => 
                  p.id === participant.id 
                    ? { ...p, ...participant, isOnline: true }
                    : p
                )
              };
            } else {
              // Add new participant
              return {
                ...prev,
                participants: [...existingParticipants, { ...participant, isOnline: true }]
              };
            }
          });
        });

        socket.on('participant_left', (data) => {
          setSession(prev => prev ? {
            ...prev,
            participants: (prev.participants || []).map(p => 
              p.id === data.participantId ? { ...p, isOnline: false } : p
            )
          } : null);
        });

        socket.on('error', (error) => {
          console.error('Socket error:', error);
          
          // Handle different types of socket errors
          if (error?.message) {
            // Show user-friendly error messages for known error types
            if (error.message.includes('Session not found')) {
              setError('Session not found or has expired');
              router.push('/');
            } else if (error.message.includes('Participant not found')) {
              setError('Unable to reconnect to session');
              router.push('/');
            } else if (error.message.includes('Unauthorized')) {
              setError('You are not authorized to access this session');
            } else {
              setError(`Connection error: ${error.message}`);
            }
          } else {
            // Generic error handling for unknown error types
            console.warn('Unknown socket error format:', error);
            setError('Connection error occurred');
          }
        });

        setIsLoading(false);

      } catch (err) {
        console.error('Failed to initialize session:', err);
        setError('Failed to load session');
        setIsLoading(false);
      }
    };

    initSession();

    return () => {
      socketService.disconnect();
    };
  }, [sessionId, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-200 via-red-200 to-green-300 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-700 font-medium">Loading session...</p>
        </div>
      </div>
    );
  }

  if (error || !session || !currentParticipant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-200 via-purple-200 to-green-200 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😞</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops!</h1>
          <p className="text-gray-600 mb-6">{error || 'Session not found'}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const renderPhase = () => {
    switch (session.currentPhase) {
      case 'SETUP':
        return (
          <ErrorBoundary>
            <SetupPhase session={session} participant={currentParticipant} isConnected={isConnected} />
          </ErrorBoundary>
        );
      case 'INPUT':
        return (
          <ErrorBoundary>
            <InputPhase session={session} participant={currentParticipant} isConnected={isConnected} />
          </ErrorBoundary>
        );
      case 'GROUPING':
        return (
          <ErrorBoundary>
            <GroupingPhase session={session} participant={currentParticipant} isConnected={isConnected} />
          </ErrorBoundary>
        );
      case 'VOTING':
        return (
          <ErrorBoundary>
            <VotingPhase session={session} participant={currentParticipant} isConnected={isConnected} />
          </ErrorBoundary>
        );
      case 'RESULTS':
        return (
          <ErrorBoundary>
            <ResultsPhase session={session} participant={currentParticipant} isConnected={isConnected} />
          </ErrorBoundary>
        );
      default:
        return <div>Unknown phase: {session.currentPhase}</div>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-200 via-purple-200 to-green-200">
      {renderPhase()}
    </div>
  );
}