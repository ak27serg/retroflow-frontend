'use client';

import { useState, useEffect } from 'react';
import { Session, Participant, Group } from '@/lib/api';
import { socketService } from '@/lib/socket';

interface VotingPhaseProps {
  session: Session;
  participant: Participant;
  isConnected: boolean;
}

interface VotableGroup extends Group {
  userVotes: number;
}

export default function VotingPhase({ session, participant, isConnected }: VotingPhaseProps) {
  const [groups, setGroups] = useState<VotableGroup[]>([]);
  const [remainingVotes, setRemainingVotes] = useState(4);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Create votable groups from actual groups AND individual cards
    const votableGroups: VotableGroup[] = [];
    
    // Add actual groups
    if (session.groups) {
      session.groups.forEach(group => {
        votableGroups.push({
          ...group,
          userVotes: 0
        });
      });
    }
    
    // Add individual cards as single-item "groups"
    if (session.responses) {
      const ungroupedResponses = session.responses.filter(response => !response.groupId);
      ungroupedResponses.forEach(response => {
        // Create a virtual group for each individual card
        votableGroups.push({
          id: `individual-${response.id}`, // Virtual group ID
          sessionId: session.id,
          label: response.content.length > 30 
            ? response.content.substring(0, 30) + '...'
            : response.content,
          color: response.category === 'WENT_WELL' ? '#10b981' : '#ef4444',
          positionX: response.positionX || 0,
          positionY: response.positionY || 0,
          voteCount: 0,
          createdAt: response.createdAt,
          responses: [response], // Single response in virtual group
          userVotes: 0
        });
      });
    }
    
    setGroups(votableGroups);

    // Load existing votes for current participant
    if (session.votes) {
      const myVotes = session.votes.filter(vote => vote.participantId === participant.id);
      let totalUsedVotes = 0;
      
      setGroups(prev => prev.map(group => {
        const userVote = myVotes.find(vote => vote.groupId === group.id);
        const userVotes = userVote ? userVote.voteCount : 0;
        totalUsedVotes += userVotes;
        
        return {
          ...group,
          userVotes
        };
      }));

      setRemainingVotes(4 - totalUsedVotes);
    }

    // Listen for vote updates
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleVotesUpdated = (data: { groupId: string; totalVotes: number }) => {
      setGroups(prev => prev.map(group => 
        group.id === data.groupId 
          ? { ...group, voteCount: data.totalVotes }
          : group
      ));
    };

    socket.on('votes_updated', handleVotesUpdated);

    return () => {
      socket.off('votes_updated', handleVotesUpdated);
    };
  }, [session, participant.id]);

  const castVote = async (groupId: string, voteCount: number) => {
    if (!isConnected || isSubmitting) return;

    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const currentUserVotes = group.userVotes;
    const voteDifference = voteCount - currentUserVotes;

    if (voteDifference > remainingVotes) {
      // Not enough votes remaining
      return;
    }

    setIsSubmitting(true);

    try {
      socketService.emit('cast_vote', {
        sessionId: session.id,
        participantId: participant.id,
        groupId,
        voteCount
      });

      // Optimistically update UI
      setGroups(prev => prev.map(g => 
        g.id === groupId 
          ? { ...g, userVotes: voteCount }
          : g
      ));
      setRemainingVotes(prev => prev - voteDifference);

    } catch (error) {
      console.error('Failed to cast vote:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addVote = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group || remainingVotes <= 0) return;
    
    castVote(groupId, group.userVotes + 1);
  };

  const removeVote = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group || group.userVotes <= 0) return;
    
    castVote(groupId, group.userVotes - 1);
  };

  const moveToResults = () => {
    socketService.emit('change_phase', {
      sessionId: session.id,
      phase: 'RESULTS'
    });
  };

  // Keep groups in their original positions (don't sort during voting)
  const displayGroups = [...groups];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Voting Phase</h1>
        <p className="text-gray-600">Vote on the most important groups - distribute your votes wisely</p>
        
        <div className="flex justify-center items-center gap-6 mt-6">
          <div className="bg-blue-100 px-6 py-3 rounded-lg">
            <span className="text-blue-800 font-semibold">
              Remaining Votes: {remainingVotes}
            </span>
          </div>
          
          {participant.isHost && (
            <div className="flex gap-3">
              <button
                onClick={() => socketService.emit('change_phase', { sessionId: session.id, phase: 'GROUPING' })}
                disabled={!isConnected}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
              >
                ← Back to Grouping
              </button>
              <button
                onClick={moveToResults}
                disabled={!isConnected}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold flex items-center gap-2"
              >
                View Results →
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        {displayGroups.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Groups Found</h3>
            <p className="text-gray-600">Go back to the grouping phase to create some groups first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayGroups.map((group) => (
              <div
                key={group.id}
                className="bg-white rounded-xl border-2 border-gray-200 p-6 hover:border-gray-300 transition-colors"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {group.label || 'Unnamed Group'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {group.responses?.length || 0} items
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-2xl font-bold text-purple-600">
                      {group.voteCount}
                    </div>
                    <div className="text-xs text-gray-500">total votes</div>
                  </div>
                </div>

                {/* Group responses preview */}
                <div className="mb-4 max-h-32 overflow-y-auto">
                  <div className="space-y-1">
                    {group.responses?.slice(0, 3).map((response, index) => (
                      <div
                        key={response.id || index}
                        className={`text-xs p-2 rounded ${
                          response.category === 'WENT_WELL'
                            ? 'bg-green-50 text-green-800'
                            : 'bg-red-50 text-red-800'
                        }`}
                      >
                        {response.content}
                      </div>
                    ))}
                    {(group.responses?.length || 0) > 3 && (
                      <div className="text-xs text-gray-500 text-center">
                        +{(group.responses?.length || 0) - 3} more items...
                      </div>
                    )}
                  </div>
                </div>

                {/* Voting controls */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Your votes:</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4].map((num) => (
                        <div
                          key={num}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-semibold ${
                            num <= group.userVotes
                              ? 'bg-purple-600 border-purple-600 text-white'
                              : 'border-gray-300 text-gray-400'
                          }`}
                        >
                          {num <= group.userVotes ? '✓' : num}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => removeVote(group.id)}
                      disabled={group.userVotes <= 0 || isSubmitting}
                      className="w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Remove vote"
                    >
                      −
                    </button>
                    <button
                      onClick={() => addVote(group.id)}
                      disabled={remainingVotes <= 0 || group.userVotes >= 4 || isSubmitting}
                      className="w-8 h-8 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Add vote"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}