'use client';

import { useState, useEffect, useCallback } from 'react';
import { Session, Participant, Group } from '@/lib/api';
import { socketService } from '@/lib/socket';

interface ResultsPhaseProps {
  session: Session;
  participant: Participant;
  isConnected: boolean;
}

export default function ResultsPhase({ session, participant }: ResultsPhaseProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [showActionItems, setShowActionItems] = useState(false);
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [newActionItem, setNewActionItem] = useState('');
  const [presentationMode, setPresentationMode] = useState(false);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);

  useEffect(() => {
    console.log('ResultsPhase: Processing session data', {
      sessionGroups: session.groups,
      sessionVotes: session.votes,
      sessionResponses: session.responses
    });
    
    // Now that individual responses get actual groups created when voted on,
    // we can just use all groups from the session
    const allGroups: Group[] = [];
    
    // Add all groups (including those created for individual responses)
    if (session.groups) {
      session.groups.forEach(group => {
        console.log('Processing group:', {
          id: group.id,
          label: group.label,
          voteCount: group.voteCount,
          responsesCount: group.responses?.length || 0
        });
        
        // Only include groups that have votes or responses
        if (group.voteCount > 0 || (group.responses && group.responses.length > 0)) {
          allGroups.push(group);
        }
      });
    }
    
    console.log('Filtered groups:', allGroups);
    
    // Sort all groups by vote count (highest to lowest)
    const sortedGroups = allGroups.sort((a, b) => b.voteCount - a.voteCount);
    
    console.log('Final sorted groups:', sortedGroups);
    setGroups(sortedGroups);
  }, [session.groups, session.responses, session.votes]);

  const addActionItem = () => {
    if (newActionItem.trim()) {
      setActionItems(prev => [...prev, newActionItem.trim()]);
      setNewActionItem('');
    }
  };

  const removeActionItem = (index: number) => {
    setActionItems(prev => prev.filter((_, i) => i !== index));
  };

  const exportResults = () => {
    const results = {
      sessionTitle: session.title,
      date: new Date().toISOString().split('T')[0],
      participants: session.participants?.map(p => ({
        name: p.displayName,
        avatar: p.avatarId
      })),
      groupsByPriority: groups.map((group, index) => ({
        rank: index + 1,
        title: group.label || 'Unnamed Group',
        votes: group.voteCount,
        items: group.responses?.map(r => ({
          content: r.content,
          category: r.category,
          author: r.participant?.displayName
        })) || []
      })),
      actionItems
    };

    const dataStr = JSON.stringify(results, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `retroflow-results-${session.title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const startNewRetro = () => {
    window.location.href = '/';
  };

  const startPresentation = () => {
    setPresentationMode(true);
    setCurrentItemIndex(0);
  };

  const exitPresentation = () => {
    setPresentationMode(false);
    setCurrentItemIndex(0);
  };

  const nextItem = useCallback(() => {
    if (currentItemIndex < groups.length - 1) {
      setCurrentItemIndex(prev => prev + 1);
    }
  }, [currentItemIndex, groups.length]);

  const prevItem = useCallback(() => {
    if (currentItemIndex > 0) {
      setCurrentItemIndex(prev => prev - 1);
    }
  }, [currentItemIndex]);

  const goToItem = (index: number) => {
    setCurrentItemIndex(index);
  };

  // Handle keyboard navigation
  useEffect(() => {
    if (!presentationMode) return;

    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        nextItem();
      } else if (event.key === 'ArrowLeft') {
        prevItem();
      } else if (event.key === 'Escape') {
        exitPresentation();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [presentationMode, currentItemIndex, groups.length, nextItem, prevItem]);

  const getMedal = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}.`;
  };

  const totalResponses = groups.reduce((sum, group) => sum + (group.responses?.length || 0), 0);
  const totalVotes = groups.reduce((sum, group) => sum + group.voteCount, 0);
  const participantCount = session.participants?.length || 0;

  // Presentation Mode View
  if (presentationMode) {
    const currentItem = groups[currentItemIndex];
    if (!currentItem) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center text-white">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">No Results to Display</h1>
            <button
              onClick={exitPresentation}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
            >
              Back to Summary
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-700 text-white flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6">
          <div className="flex items-center gap-4">
            <button
              onClick={exitPresentation}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold"
            >
              ← Back to Summary
            </button>
            <span className="text-lg">
              {currentItemIndex + 1} of {groups.length}
            </span>
          </div>
          
          <h1 className="text-2xl font-bold">{session.title}</h1>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Use ← → keys or</span>
            <div className="flex gap-1">
              <button
                onClick={prevItem}
                disabled={currentItemIndex === 0}
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded disabled:opacity-50"
              >
                ←
              </button>
              <button
                onClick={nextItem}
                disabled={currentItemIndex === groups.length - 1}
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded disabled:opacity-50"
              >
                →
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="max-w-4xl w-full text-center">
            {/* Ranking */}
            <div className="mb-8">
              <div className="text-6xl mb-4">{getMedal(currentItemIndex)}</div>
              <div className="text-3xl font-bold text-yellow-400 mb-2">
                Rank #{currentItemIndex + 1}
              </div>
              <div className="text-6xl font-bold text-white mb-4">
                {currentItem.voteCount} {currentItem.voteCount === 1 ? 'Vote' : 'Votes'}
              </div>
            </div>

            {/* Group/Item Details */}
            <div className="bg-white/10 backdrop-blur rounded-2xl p-8 mb-8">
              <h2 className="text-3xl font-bold text-white mb-6">
                {currentItem.label || 'Unnamed Item'}
              </h2>
              
              {/* Responses */}
              <div className="grid md:grid-cols-2 gap-4">
                {currentItem.responses?.map((response, index) => (
                  <div
                    key={response.id || index}
                    className={`p-4 rounded-xl text-left ${
                      response.category === 'WENT_WELL'
                        ? 'bg-green-500/20 border border-green-400'
                        : 'bg-red-500/20 border border-red-400'
                    }`}
                  >
                    <p className="text-white text-lg mb-3">{response.content}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <span>{response.participant?.avatarId}</span>
                      <span>{response.participant?.displayName}</span>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        response.category === 'WENT_WELL'
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                      }`}>
                        {response.category === 'WENT_WELL' ? '😊 Went Well' : '😕 Needs Work'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress Dots */}
            <div className="flex justify-center gap-2">
              {groups.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToItem(index)}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    index === currentItemIndex
                      ? 'bg-white'
                      : 'bg-white/30 hover:bg-white/50'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Summary View (Original)
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">🎉 Retrospective Results</h1>
        <p className="text-xl text-gray-600 mb-4">{session.title}</p>
        
        {/* Stats */}
        <div className="flex justify-center gap-8 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{participantCount}</div>
            <div className="text-sm text-gray-500">Participants</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{totalResponses}</div>
            <div className="text-sm text-gray-500">Responses</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{totalVotes}</div>
            <div className="text-sm text-gray-500">Total Votes</div>
          </div>
        </div>

        {/* Action buttons - Host only */}
        {participant.isHost && (
          <div className="flex justify-center gap-4 mb-4">
            <button
              onClick={startPresentation}
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 font-semibold"
            >
              📽️ Start Presentation
            </button>
            <button
              onClick={() => setShowActionItems(!showActionItems)}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
            >
              {showActionItems ? 'Hide' : 'Show'} Action Items
            </button>
            <button
              onClick={exportResults}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold"
            >
              Export Results
            </button>
            <button
              onClick={startNewRetro}
              className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 font-semibold"
            >
              New Retro
            </button>
          </div>
        )}

        {/* Host navigation */}
        {participant.isHost && (
          <div className="flex justify-center">
            <button
              onClick={() => socketService.emit('change_phase', { sessionId: session.id, phase: 'VOTING' })}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center gap-2"
            >
              ← Back to Voting
            </button>
          </div>
        )}
      </div>

      {/* Action Items Section */}
      {showActionItems && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-8">
          <h3 className="text-xl font-semibold text-yellow-800 mb-4">📋 Action Items</h3>
          
          <div className="space-y-3 mb-4">
            {actionItems.map((item, index) => (
              <div key={index} className="flex items-center gap-3 bg-white p-3 rounded-lg">
                <span className="text-yellow-600 font-semibold">{index + 1}.</span>
                <span className="flex-1 text-gray-800">{item}</span>
                {participant.isHost && (
                  <button
                    onClick={() => removeActionItem(index)}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="Remove action item"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {participant.isHost && (
            <div className="flex gap-3">
              <input
                type="text"
                value={newActionItem}
                onChange={(e) => setNewActionItem(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addActionItem()}
                placeholder="Add an action item..."
                className="flex-1 px-4 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-gray-900 placeholder-gray-700"
              />
              <button
                onClick={addActionItem}
                disabled={!newActionItem.trim()}
                className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <div className="max-w-4xl mx-auto">
        {groups.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Results Yet</h3>
            <p className="text-gray-600">Complete the voting phase to see prioritized results.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group, index) => (
              <div
                key={group.id}
                className={`bg-white rounded-xl border-2 p-6 ${
                  index === 0 
                    ? 'border-yellow-400 bg-gradient-to-r from-yellow-50 to-white' 
                    : index === 1
                    ? 'border-gray-400 bg-gradient-to-r from-gray-50 to-white'
                    : index === 2
                    ? 'border-orange-400 bg-gradient-to-r from-orange-50 to-white'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getMedal(index)}</span>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        {group.label || 'Unnamed Group'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {group.responses?.length || 0} responses
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-3xl font-bold text-purple-600">
                      {group.voteCount}
                    </div>
                    <div className="text-sm text-gray-500">votes</div>
                  </div>
                </div>

                {/* Group responses */}
                <div className="grid md:grid-cols-2 gap-4">
                  {group.responses?.map((response) => (
                    <div
                      key={response.id}
                      className={`p-3 rounded-lg border ${
                        response.category === 'WENT_WELL'
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <p className="text-sm text-gray-800 mb-2">{response.content}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{response.participant?.avatarId}</span>
                        <span>{response.participant?.displayName}</span>
                        <span className={`px-2 py-1 rounded-full ${
                          response.category === 'WENT_WELL'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {response.category === 'WENT_WELL' ? '😊 Went Well' : '😕 Needs Work'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center mt-12 pt-8 border-t border-gray-200">
        <p className="text-sm text-gray-500">
          Generated by RetroFlow • {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}