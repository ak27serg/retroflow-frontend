'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiService } from '@/lib/api';

const AVATAR_OPTIONS = [
  '🦁', '🐯', '🦊', '🐺', '🐙', '🦈', '🤖', '🦅',
  '🐉', '🦋', '🐝', '🦜', '🦩', '🐧', '👻', '🦖'
];

export default function JoinSession() {
  const router = useRouter();
  const [step, setStep] = useState<'code' | 'details'>('code');
  const [formData, setFormData] = useState({
    inviteCode: '',
    displayName: '',
    avatarId: '🦁'
  });
  const [sessionInfo, setSessionInfo] = useState<{
    id?: string;
    title?: string;
    currentPhase?: string;
    participantCount: number;
    participants?: Array<{ avatarId: string; displayName: string }>;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }

    setIsLoading(true);

    try {
      const session = await apiService.getSessionByInviteCode(formData.inviteCode.toUpperCase());
      setSessionInfo({
        id: session.id,
        title: session.title,
        currentPhase: session.currentPhase,
        participantCount: session.participants?.length || 0,
        participants: session.participants?.map(p => ({ avatarId: p.avatarId, displayName: p.displayName })) || []
      });
      setStep('details');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid invite code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.displayName.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiService.joinSession({
        inviteCode: formData.inviteCode.toUpperCase(),
        displayName: formData.displayName.trim(),
        avatarId: formData.avatarId
      });

      // Store session info in localStorage
      localStorage.setItem('retroflow-session', JSON.stringify({
        sessionId: response.session.id,
        participantId: response.participant.id,
        isHost: false
      }));

      router.push(`/session/${response.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSessionData = async () => {
    if (!sessionInfo?.id || !formData.inviteCode) return;
    
    setIsRefreshingSession(true);
    try {
      const session = await apiService.getSessionByInviteCode(formData.inviteCode.toUpperCase());
      setSessionInfo({
        id: session.id,
        title: session.title,
        currentPhase: session.currentPhase,
        participantCount: session.participants?.length || 0,
        participants: session.participants?.map(p => ({ avatarId: p.avatarId, displayName: p.displayName })) || []
      });
      
      // If current selected avatar is now taken, reset to first available
      const currentAvatarTaken = session.participants?.some(p => p.avatarId === formData.avatarId);
      if (currentAvatarTaken) {
        const availableAvatar = AVATAR_OPTIONS.find(avatar => 
          !session.participants?.some(p => p.avatarId === avatar)
        );
        if (availableAvatar) {
          setFormData(prev => ({ ...prev, avatarId: availableAvatar }));
        }
      }
    } catch (err) {
      console.error('Failed to refresh session data:', err);
    } finally {
      setIsRefreshingSession(false);
    }
  };

  const handleBack = () => {
    setStep('code');
    setSessionInfo(null);
    setError('');
  };

  // Refresh session data when entering avatar selection step
  useEffect(() => {
    if (step === 'details' && sessionInfo?.id) {
      refreshSessionData();
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-white/90 backdrop-blur rounded-xl shadow-lg p-8">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-2xl text-white">🎯</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Join Retro</h2>
        <p className="text-gray-600">Enter an invite code to join an existing session</p>
      </div>

      {step === 'code' ? (
        <form onSubmit={handleCodeSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Invite Code *
            </label>
            <input
              type="text"
              value={formData.inviteCode}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                inviteCode: e.target.value.toUpperCase() 
              }))}
              placeholder="Enter 4-character code"
              maxLength={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent uppercase tracking-widest text-center font-mono text-lg text-gray-900 placeholder-gray-500"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Checking Code...' : 'Find Session'}
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          {sessionInfo && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-semibold text-green-800 mb-1">{sessionInfo.title || 'Untitled Session'}</h3>
              <p className="text-sm text-green-600">
                {sessionInfo.participantCount} participant{sessionInfo.participantCount !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          <form onSubmit={handleJoinSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Name *
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="Enter your display name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Choose Your Avatar
              </label>
              {isRefreshingSession && (
                <p className="text-xs text-gray-500 mb-2">Refreshing available avatars...</p>
              )}
              <div className="grid grid-cols-8 gap-2">
                {AVATAR_OPTIONS.map((avatar, index) => {
                  const isUsed = sessionInfo?.participants?.some(p => p.avatarId === avatar) || false;
                  const isSelected = formData.avatarId === avatar;
                  
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => !isUsed && setFormData(prev => ({ ...prev, avatarId: avatar }))}
                      disabled={isUsed && !isSelected}
                      className={`p-3 rounded-lg text-2xl border-2 transition-colors flex items-center justify-center relative ${
                        isUsed && !isSelected
                          ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                          : isSelected 
                          ? 'border-green-500 bg-green-50 hover:bg-green-50' 
                          : 'border-gray-200 hover:bg-green-50'
                      }`}
                      title={isUsed ? `Used by ${sessionInfo?.participants?.find(p => p.avatarId === avatar)?.displayName}` : ''}
                    >
                      {avatar}
                      {isUsed && !isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-200/80 rounded-lg">
                          <span className="text-sm text-gray-600">✗</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Joining...' : 'Join Session'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}