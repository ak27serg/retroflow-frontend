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
  const [participantVotingProgress, setParticipantVotingProgress] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    // Only proceed if we have essential session data
    if (!session || !session.id) {
      console.log('VotingPhase: Session data not ready, skipping group creation');
      return;
    }

    console.log('VotingPhase: Creating votable groups from session data', {
      hasGroups: !!session.groups,
      groupsCount: session.groups?.length || 0,
      hasResponses: !!session.responses,
      responsesCount: session.responses?.length || 0,
      hasVotes: !!session.votes,
      votesCount: session.votes?.length || 0
    });

    // Create votable groups from actual groups AND individual cards
    const votableGroups: VotableGroup[] = [];
    
    // Add actual groups
    if (session.groups && session.groups.length > 0) {
      session.groups.forEach(group => {
        votableGroups.push({
          ...group,
          userVotes: 0
        });
      });
    }
    
    // Add individual cards as single-item "groups"
    if (session.responses && session.responses.length > 0) {
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
    
    console.log('VotingPhase: Created votable groups:', votableGroups.length);
    setGroups(votableGroups);

    // Load existing votes for current participant
    if (session.votes && session.votes.length > 0 && votableGroups.length > 0) {
      const myVotes = session.votes.filter(vote => vote.participantId === participant.id);
      let totalUsedVotes = 0;
      
      const groupsWithVotes = votableGroups.map(group => {
        const userVote = myVotes.find(vote => vote.groupId === group.id);
        const userVotes = userVote ? userVote.voteCount : 0;
        totalUsedVotes += userVotes;
        
        return {
          ...group,
          userVotes
        };
      });

      console.log('VotingPhase: Applied existing votes, total used:', totalUsedVotes);
      setGroups(groupsWithVotes);
      setRemainingVotes(4 - totalUsedVotes);
    } else {
      console.log('VotingPhase: No existing votes to load or no groups available');
      setRemainingVotes(4);
    }

    // Calculate voting progress for all participants (for host visibility)
    if (participant.isHost && session.votes && session.participants) {
      const progressMap = new Map<string, number>();
      
      session.participants.forEach(p => {
        const participantVotes = session.votes?.filter(vote => vote.participantId === p.id) || [];
        const totalUsedVotes = participantVotes.reduce((sum, vote) => sum + vote.voteCount, 0);
        const remainingVotes = 4 - totalUsedVotes;
        progressMap.set(p.id, remainingVotes);
      });
      
      setParticipantVotingProgress(progressMap);
    }

    // Listen for vote updates
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleVotesUpdated = (data: { groupId: string; totalVotes: number; participantProgress?: Record<string, number> }) => {
      setGroups(prev => prev.map(group => 
        group.id === data.groupId 
          ? { ...group, voteCount: data.totalVotes }
          : group
      ));

      // Update participant voting progress if provided
      if (data.participantProgress && participant.isHost) {
        const progressMap = new Map<string, number>();
        Object.entries(data.participantProgress).forEach(([participantId, remainingVotes]) => {
          progressMap.set(participantId, remainingVotes);
        });
        setParticipantVotingProgress(progressMap);
        console.log('VotingPhase: Updated participant progress from socket event:', data.participantProgress);
      }
    };

    socket.on('votes_updated', handleVotesUpdated);

    return () => {
      socket.off('votes_updated', handleVotesUpdated);
    };
  }, [session, participant.id]);

  // Note: Real-time progress updates are now handled in the main handleVotesUpdated function above

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

      <div className="max-w-6xl mx-auto">
        <div className="flex gap-8 items-start">
          {/* Voting Progress - visible to host only */}
          {participant.isHost && (
            <div className="flex-shrink-0 w-64">
              {session.participants && session.participants.length > 1 && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <h3 className="text-sm font-semibold text-purple-800 mb-3 flex items-center gap-2">
                    🗳️ Voting Progress
                  </h3>
                  <div className="space-y-2">
                    {session.participants
                      .filter(p => !p.isHost) // Exclude host from progress tracking
                      .map(p => {
                        const remainingVotes = participantVotingProgress.get(p.id) ?? 4;
                        const usedVotes = 4 - remainingVotes;
                        return (
                          <div key={p.id} className="text-xs">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">{p.avatarId}</span>
                              <span className="text-purple-700 font-medium">{p.displayName}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="flex gap-1">
                                {[1, 2, 3, 4].map((vote) => (
                                  <div
                                    key={vote}
                                    className={`w-3 h-3 rounded-full ${
                                      vote <= usedVotes
                                        ? 'bg-purple-500'
                                        : 'bg-gray-200'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-purple-600 ml-2 font-medium">
                                {remainingVotes} left
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Main voting content */}
          <div className="flex-1">
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

                {/* Group responses preview - consolidated view */}
                <div className="mb-4">
                  <div 
                    className={`text-sm p-3 rounded-lg border-2 leading-relaxed ${
                      group.responses?.[0]?.category === 'WENT_WELL'
                        ? 'bg-green-50 border-green-200 text-green-900'
                        : 'bg-red-50 border-red-200 text-red-900'
                    }`}
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxHeight: '4.5em', // Approximately 3 lines
                      lineHeight: '1.5em'
                    }}
                  >
                    {group.responses?.map((response, index) => (
                      <span key={response.id || index}>
                        {index > 0 && ' • '}
                        {response.content}
                      </span>
                    ))}
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
      </div>
    </div>
  );
}