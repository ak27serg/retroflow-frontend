'use client';

import { Session, Participant } from '@/lib/api';
import { socketService } from '@/lib/socket';
import { useState } from 'react';

interface SetupPhaseProps {
  session: Session;
  participant: Participant;
  isConnected: boolean;
}

export default function SetupPhase({ session, participant, isConnected }: SetupPhaseProps) {
  const [isStarting, setIsStarting] = useState(false);

  console.log('SetupPhase received:', {
    session,
    sessionParticipants: session.participants,
    participantCount: session.participants?.length || 0,
    participant,
    isConnected
  });

  const startRetro = () => {
    if (!participant.isHost || !isConnected) return;
    
    setIsStarting(true);
    socketService.emit('change_phase', {
      sessionId: session.id,
      phase: 'INPUT',
      timerDuration: 600 // 10 minutes
    });
  };

  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(session.inviteCode);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy invite code:', err);
    }
  };

  const copyInviteUrl = async () => {
    try {
      const url = `${window.location.origin}?join=${session.inviteCode}`;
      await navigator.clipboard.writeText(url);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy invite URL:', err);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-4 mb-4">
          <h1 className="text-4xl font-bold text-gray-900">{session.title}</h1>
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} 
               title={isConnected ? 'Connected' : 'Disconnected'} />
        </div>
        <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
          <span>Invite Code: <code className="bg-gray-100 px-2 py-1 rounded font-mono">{session.inviteCode}</code></span>
          <button 
            onClick={copyInviteCode}
            className="text-blue-600 hover:text-blue-800"
            title="Copy invite code"
          >
            📋
          </button>
          <button 
            onClick={copyInviteUrl}
            className="text-blue-600 hover:text-blue-800"
            title="Copy invite URL"
          >
            🔗
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Participants */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              👥 Participants ({session.participants?.length || 0})
            </h2>
            <div className="space-y-3">
              {session.participants?.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-2xl">{p.avatarId}</span>
                  <span className="font-medium text-gray-900">{p.displayName}</span>
                  {p.isHost && (
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                      Host
                    </span>
                  )}
                  <div className={`w-2 h-2 rounded-full ml-auto ${
                    p.isOnline ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                </div>
              ))}
            </div>
          </div>

          {/* Session Info */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              ℹ️ Session Overview
            </h2>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">What We&apos;ll Do:</h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Share thoughts privately (10 min)</li>
                  <li>Group related feedback together</li>
                  <li>Vote on the most important topics</li>
                  <li>Review results and plan actions</li>
                </ol>
              </div>
              
              <div className="p-4 bg-yellow-50 rounded-lg">
                <h3 className="font-semibold text-yellow-900 mb-2">💡 Tips:</h3>
                <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                  <li>Be honest and constructive</li>
                  <li>Focus on the work, not individuals</li>
                  <li>Think about what can be improved</li>
                </ul>
              </div>

              {participant.isHost && (
                <div className="pt-4 border-t">
                  <button
                    onClick={startRetro}
                    disabled={!isConnected || isStarting || (session.participants?.length || 0) < 1}
                    className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isStarting ? 'Starting Retro...' : 'Start Retrospective'}
                  </button>
                  {!isConnected && (
                    <p className="text-sm text-red-600 mt-2">Not connected to server</p>
                  )}
                </div>
              )}
              
              {!participant.isHost && (
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <p className="text-sm text-gray-600">
                    Waiting for <strong>{session.participants?.find(p => p.isHost)?.displayName}</strong> to start the retrospective...
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}