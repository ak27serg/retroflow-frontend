'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiService } from '@/lib/api';

const AVATAR_OPTIONS = [
  '🦁', '🐯', '🦊', '🐺', '🐙', '🦈', '🤖', '🦅',
  '🐉', '🦋', '🐝', '🦜', '🦩', '🐧', '👻', '🦖'
];

export default function CreateSession() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: '',
    hostName: '',
    hostAvatar: '🦁'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.hostName.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiService.createSession({
        title: formData.title.trim() || undefined,
        hostName: formData.hostName.trim(),
        hostAvatar: formData.hostAvatar
      });

      // Find the host participant from the response
      const hostParticipant = response.session.participants?.find(p => p.isHost);
      const participantId = hostParticipant?.id || response.session.hostId;

      console.log('Debug session creation:', {
        session: response.session,
        participants: response.session.participants,
        hostParticipant,
        participantId
      });

      // Store session info in localStorage for the host
      localStorage.setItem('retroflow-session', JSON.stringify({
        sessionId: response.session.id,
        participantId: participantId,
        isHost: true
      }));

      router.push(`/session/${response.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur rounded-xl shadow-lg p-8">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-2xl text-white">🚀</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Start New Retro</h2>
        <p className="text-gray-600">Create a retrospective session for your team</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Session Title (optional)
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., Sprint 12 Retrospective"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Name *
          </label>
          <input
            type="text"
            value={formData.hostName}
            onChange={(e) => setFormData(prev => ({ ...prev, hostName: e.target.value }))}
            placeholder="Enter your display name"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Choose Your Avatar
          </label>
          <div className="grid grid-cols-8 gap-2">
            {AVATAR_OPTIONS.map((avatar, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, hostAvatar: avatar }))}
                className={`p-3 rounded-lg text-2xl hover:bg-blue-50 border-2 transition-colors flex items-center justify-center ${
                  formData.hostAvatar === avatar 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200'
                }`}
              >
                {avatar}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Creating Session...' : 'Create Session'}
        </button>
      </form>
    </div>
  );
}